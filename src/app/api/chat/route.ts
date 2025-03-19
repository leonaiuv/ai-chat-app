import { NextResponse } from 'next/server';
import { DEEPSEEK_API_URL } from '@/lib/constants';
import { v4 as uuidv4 } from 'uuid'; // 需要安装: npm install uuid @types/uuid

// 设置最大运行时间为300秒
export const maxDuration = 300; 

// 定义日志级别
enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

// 结构化日志记录函数
function logMessage(level: LogLevel, message: string, requestId: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    requestId,
    message,
    ...(data && { data })
  };
  
  // 根据不同级别使用不同的控制台方法
  switch (level) {
    case LogLevel.DEBUG:
      console.debug(JSON.stringify(logEntry));
      break;
    case LogLevel.INFO:
      console.info(JSON.stringify(logEntry));
      break;
    case LogLevel.WARN:
      console.warn(JSON.stringify(logEntry));
      break;
    case LogLevel.ERROR:
      console.error(JSON.stringify(logEntry));
      break;
  }
}

export async function POST(request: Request) {
  // 为每个请求生成唯一ID
  const requestId = uuidv4();
  const requestStartTime = performance.now();
  let retryCount = 0;
  const maxRetries = 3;
  
  // 记录请求开始
  logMessage(LogLevel.INFO, 'API请求开始', requestId);
  
  // 添加重试逻辑
  async function fetchWithRetry() {
    try {
      const requestBody = await request.json();
      const { messages, apiKey, model } = requestBody;
      
      // 记录请求信息（移除敏感信息）
      logMessage(LogLevel.INFO, '请求参数', requestId, {
        model,
        messageCount: messages.length,
        firstMessagePreview: messages.length > 0 ? 
          `${messages[0].role}: ${messages[0].content.substring(0, 50)}${messages[0].content.length > 50 ? '...' : ''}` : 
          null,
        lastMessagePreview: messages.length > 0 ? 
          `${messages[messages.length-1].role}: ${messages[messages.length-1].content.substring(0, 50)}${messages[messages.length-1].content.length > 50 ? '...' : ''}` : 
          null
      });
      
      if (!apiKey) {
        logMessage(LogLevel.ERROR, 'API密钥未提供', requestId);
        return NextResponse.json({ error: "API密钥未提供" }, { status: 400 });
      }

      // 设置请求头
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('Authorization', `Bearer ${apiKey}`);
      headers.set('accept', 'application/json');
      headers.set('X-Request-ID', requestId); // 添加请求ID到请求头

      // 准备请求体
      const body = JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        temperature: 0.7,
        reasoning_engine: true,
        reasoning_width: 4,
      });

      // 创建请求选项
      const options = {
        method: 'POST',
        headers,
        body,
        // 设置超时
        signal: AbortSignal.timeout(1200000), // 20分钟超时
      };

      // 记录API调用开始
      const apiCallStartTime = performance.now();
      logMessage(LogLevel.INFO, 'DeepSeek API调用开始', requestId, { model });

      try {
        // 发起API请求
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', options);
        const apiCallDuration = performance.now() - apiCallStartTime;
        
        if (!response.ok) {
          const errorData = await response.text();
          logMessage(LogLevel.ERROR, `DeepSeek API请求失败: ${response.status} ${response.statusText}`, requestId, {
            errorData,
            duration: apiCallDuration
          });
          throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        
        logMessage(LogLevel.INFO, 'DeepSeek API调用成功，开始处理流数据', requestId, {
          statusCode: response.status,
          duration: apiCallDuration
        });

        // 创建新的响应流
        const stream = new ReadableStream({
          async start(controller) {
            let chunkCount = 0;
            const reader = response.body?.getReader();
            if (!reader) {
              logMessage(LogLevel.ERROR, '无法获取响应流读取器', requestId);
              controller.close();
              return;
            }

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  // 流结束时，发送[DONE]标记
                  const doneString = 'data: [DONE]\n\n';
                  controller.enqueue(new TextEncoder().encode(doneString));
                  controller.close();
                  logMessage(LogLevel.INFO, '流数据处理完成', requestId, { 
                    totalChunks: chunkCount 
                  });
                  break;
                }

                chunkCount++;
                // 每10个数据块记录一次进度
                if (chunkCount % 10 === 0) {
                  logMessage(LogLevel.DEBUG, '流数据处理进度', requestId, { 
                    chunksProcessed: chunkCount 
                  });
                }
                
                // 转发原始数据
                controller.enqueue(value);
              }
            } catch (error: any) {
              logMessage(LogLevel.ERROR, '流处理过程中出错', requestId, {
                errorMessage: error.message,
                errorStack: error.stack
              });
              
              try {
                // 尝试发送错误信息
                const errorString = `data: {"error":"${error.message || '流处理过程中出错'}"}\n\n`;
                controller.enqueue(new TextEncoder().encode(errorString));
                // 确保在出错后也发送[DONE]标记
                const doneString = 'data: [DONE]\n\n';
                controller.enqueue(new TextEncoder().encode(doneString));
              } catch (e: any) {
                logMessage(LogLevel.ERROR, '无法发送错误信息', requestId, {
                  errorMessage: e.message,
                  errorStack: e.stack
                });
              } finally {
                // 确保流被关闭
                try {
                  controller.close();
                } catch (closeError: any) {
                  logMessage(LogLevel.ERROR, '关闭流时出错', requestId, {
                    errorMessage: closeError.message
                  });
                }
              }
            }
          },
          cancel() {
            // 当流被取消时释放资源
            try {
              response.body?.cancel();
              logMessage(LogLevel.INFO, '流被客户端取消', requestId);
            } catch (cancelError: any) {
              logMessage(LogLevel.ERROR, '取消流时出错', requestId, {
                errorMessage: cancelError.message
              });
            }
          }
        });
        
        // 记录完整请求处理时间
        const requestDuration = performance.now() - requestStartTime;
        logMessage(LogLevel.INFO, 'API请求处理完成', requestId, {
          duration: requestDuration,
          model,
          success: true
        });
        
        // 返回响应
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Request-ID': requestId // 返回请求ID给客户端
          },
        });
      } catch (error: any) {
        // 捕获网络请求错误
        logMessage(LogLevel.ERROR, 'DeepSeek API请求过程中出错', requestId, {
          errorMessage: error.message,
          errorName: error.name,
          errorStack: error.stack,
          retryCount
        });
        
        // 如果是超时或网络错误，且未超过最大重试次数，则重试
        if ((error.name === 'AbortError' || 
             error.name === 'TypeError' || 
             error.message?.includes('network') || 
             error.message?.includes('socket') ||
             error.message?.includes('failed') ||
             error.message?.includes('terminated')) && 
            retryCount < maxRetries) {
          
          retryCount++;
          logMessage(LogLevel.WARN, `开始第 ${retryCount} 次重试`, requestId, {
            errorType: error.name,
            retryDelay: 1000 * Math.pow(2, retryCount - 1)
          });
          
          // 增加指数退避延迟
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount - 1)));
          return fetchWithRetry();
        }
        
        // 记录失败的请求
        const requestDuration = performance.now() - requestStartTime;
        logMessage(LogLevel.ERROR, 'API请求最终失败', requestId, {
          duration: requestDuration,
          model,
          errorMessage: error.message,
          success: false,
          retryAttempts: retryCount
        });
        
        return NextResponse.json({ 
          error: `请求失败: ${error.message || '未知错误'}`,
          requestId
        }, { 
          status: 500,
          headers: {
            'X-Request-ID': requestId
          }
        });
      }
    } catch (error: any) {
      // 请求解析或其他错误
      logMessage(LogLevel.ERROR, '请求处理过程中出错', requestId, {
        errorMessage: error.message,
        errorStack: error.stack
      });
      
      // 记录失败的请求
      const requestDuration = performance.now() - requestStartTime;
      logMessage(LogLevel.ERROR, 'API请求处理失败', requestId, {
        duration: requestDuration,
        success: false
      });
      
      return NextResponse.json({ 
        error: `处理请求时出错: ${error.message || '未知错误'}`,
        requestId 
      }, { 
        status: 500,
        headers: {
          'X-Request-ID': requestId
        }
      });
    }
  }
  
  return fetchWithRetry();
} 
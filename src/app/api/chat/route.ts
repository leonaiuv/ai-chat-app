import { NextResponse } from 'next/server';
import { DEEPSEEK_API_URL } from '@/lib/constants';

export const maxDuration = 300; // 设置最大运行时间为300秒

export async function POST(request: Request) {
  let retryCount = 0;
  const maxRetries = 3;
  
  // 添加重试逻辑
  async function fetchWithRetry() {
    try {
      const { messages, apiKey, model } = await request.json();
      
      if (!apiKey) {
        return NextResponse.json({ error: "API密钥未提供" }, { status: 400 });
      }

      // 设置请求头
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('Authorization', `Bearer ${apiKey}`);
      headers.set('accept', 'application/json');

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
        signal: AbortSignal.timeout(60000), // 60秒超时
      };

      try {
        // 发起API请求
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', options);

        if (!response.ok) {
          const errorData = await response.text();
          console.error(`API请求失败: ${response.status} ${response.statusText}`, errorData);
          throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }

        // 创建新的响应流
        const stream = new ReadableStream({
          async start(controller) {
            const reader = response.body?.getReader();
            if (!reader) {
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
                  break;
                }

                // 转发原始数据
                controller.enqueue(value);
              }
            } catch (error: any) {
              console.error("流处理过程中出错:", error);
              try {
                // 尝试发送错误信息
                const errorString = `data: {"error":"${error.message || '流处理过程中出错'}"}\n\n`;
                controller.enqueue(new TextEncoder().encode(errorString));
              } catch (e) {
                console.error("无法发送错误信息:", e);
              }
              controller.error(error);
            }
          },
        });
        
        // 返回响应
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } catch (error: any) {
        // 捕获网络请求错误
        console.error("API请求过程中出错:", error);
        
        // 如果是超时或网络错误，且未超过最大重试次数，则重试
        if ((error.name === 'AbortError' || 
             error.name === 'TypeError' || 
             error.message?.includes('network') || 
             error.message?.includes('socket') ||
             error.message?.includes('failed') ||
             error.message?.includes('terminated')) && 
            retryCount < maxRetries) {
          
          retryCount++;
          console.log(`API请求错误，正在尝试第 ${retryCount} 次重试...`);
          
          // 增加指数退避延迟
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount - 1)));
          return fetchWithRetry();
        }
        
        return NextResponse.json({ error: `请求失败: ${error.message || '未知错误'}` }, { status: 500 });
      }
    } catch (error: any) {
      console.error("请求处理过程中出错:", error);
      return NextResponse.json({ error: `处理请求时出错: ${error.message || '未知错误'}` }, { status: 500 });
    }
  }
  
  return fetchWithRetry();
} 
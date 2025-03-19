import { NextResponse } from 'next/server';
import { DEEPSEEK_API_URL } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const { messages, apiKey, model } = await request.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key未设置' },
        { status: 400 }
      );
    }

    // 检查并过滤掉所有可能的思维链消息
    const cleanedMessages = messages
      .filter((msg: any) => msg.type !== "reasoning") // 根据type过滤
      .map((msg: any) => ({
        role: msg.role,
        content: msg.content
      }));

    // 在请求体中打印日志，帮助调试
    console.log('向DeepSeek API发送请求:', {
      model,
      messagesCount: cleanedMessages.length
    });

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: cleanedMessages,
        stream: true,
      }),
    });

    // 如果API请求失败，返回错误
    if (!response.ok) {
      try {
        const errorData = await response.json();
        console.error('DeepSeek API错误:', errorData);
        return NextResponse.json(
          { error: errorData.error?.message || 'API请求失败' },
          { status: response.status }
        );
      } catch (e) {
        console.error('无法解析DeepSeek API错误:', e);
        return NextResponse.json(
          { error: `API请求失败: ${response.status} ${response.statusText}` },
          { status: response.status }
        );
      }
    }

    // 直接将上游API的流响应转发给客户端
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API错误:', error);
    return NextResponse.json(
      { error: '处理请求时出错' },
      { status: 500 }
    );
  }
} 
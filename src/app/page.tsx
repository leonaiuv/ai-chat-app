"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Send, Trash2, Settings, Menu, X, Moon, Sun, Plus, History, Download, Pencil, ChevronRight, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";
import { MODELS, LOCAL_STORAGE_KEYS } from "@/lib/constants";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  type?: "reasoning" | "answer";
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  isEditing?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [confirmedApiKey, setConfirmedApiKey] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reasoningContentRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  const [collapsedReasonings, setCollapsedReasonings] = useState<{[key: string]: boolean}>({});
  const [expandedReasonings, setExpandedReasonings] = useState<{[key: string]: boolean}>({});
  const { theme, setTheme } = useTheme();
  const [isRequestPending, setIsRequestPending] = useState(false);
  const activeRequestController = useRef<AbortController | null>(null);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const abortedControllers = useRef<Set<AbortController>>(new Set());

  // 从本地存储加载数据
  useEffect(() => {
    const savedApiKey = localStorage.getItem(LOCAL_STORAGE_KEYS.API_KEY);
    const savedModel = localStorage.getItem(LOCAL_STORAGE_KEYS.SELECTED_MODEL);
    const savedConversations = localStorage.getItem(LOCAL_STORAGE_KEYS.CONVERSATIONS);

    if (savedApiKey) {
      setApiKey(savedApiKey);
      setConfirmedApiKey(savedApiKey);
    }
    if (savedModel) setSelectedModel(savedModel);
    if (savedConversations) {
      const parsedConversations = JSON.parse(savedConversations);
      setConversations(parsedConversations);
    }
  }, []);

  // 保存数据到本地存储
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEYS.API_KEY, confirmedApiKey);
    localStorage.setItem(LOCAL_STORAGE_KEYS.SELECTED_MODEL, selectedModel);
    localStorage.setItem(LOCAL_STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
  }, [confirmedApiKey, selectedModel, conversations]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    
    // 滚动所有思维链容器到底部
    Object.keys(reasoningContentRefs.current).forEach(id => {
      const ref = reasoningContentRefs.current[id];
      if (ref) {
        ref.scrollTop = ref.scrollHeight;
      }
    });
  }, [messages]);

  // 在容器渲染后滚动到底部
  useEffect(() => {
    // 延迟一点时间确保内容已完全渲染
    const timer = setTimeout(() => {
      Object.keys(reasoningContentRefs.current).forEach(id => {
        const ref = reasoningContentRefs.current[id];
        if (ref && !collapsedReasonings[id]) {
          ref.scrollTop = ref.scrollHeight;
        }
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [messages, collapsedReasonings]);

  // 自动滚动API响应内容到底部
  const scrollReasoningToBottom = (messageId: string) => {
    const ref = reasoningContentRefs.current[messageId];
    if (ref && !collapsedReasonings[messageId]) {
      ref.scrollTop = ref.scrollHeight;
    }
  };

  // 取消正在进行的请求
  const cancelOngoingRequest = () => {
    if (activeRequestController.current && !abortedControllers.current.has(activeRequestController.current)) {
      try {
        activeRequestController.current.abort();
        abortedControllers.current.add(activeRequestController.current);
      } catch (error) {
        console.error("取消请求时出错:", error);
      }
      activeRequestController.current = null;
      setIsLoading(false);
      setIsRequestPending(false);
    }
  };

  const handleSendMessage = async () => {
    if (input.trim() === "" || !confirmedApiKey || isRequestPending) return;
    
    const newId = Date.now().toString();
    const newMessage: Message = {
      id: newId,
      content: input,
      role: "user",
      timestamp: new Date(),
    };
    
    // 更新当前会话的消息
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    setIsLoading(true);
    setIsRequestPending(true);
    
    // 记录当前正在等待响应的对话ID
    const activeConversationId = currentConversationId;
    setPendingConversationId(activeConversationId);

    // 创建一个新的中止控制器
    const controller = new AbortController();
    activeRequestController.current = controller;

    try {
      // 使用辅助函数获取过滤后的消息
      const messagesForAPI = getMessagesForAPI([...messages, newMessage]);
      
      // 使用中止控制器进行API调用
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messagesForAPI,
          apiKey: confirmedApiKey,
          model: selectedModel,
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error('API请求失败: ' + response.status);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      // 创建状态用于跟踪消息类型
      let currentPhase: "reasoning" | "answer" | null = null;
      let aiResponse = "";
      let reasoningResponse = "";
      let aiMessageId = "";
      let reasoningMessageId = "";
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // 清除待处理对话ID
          if (pendingConversationId === activeConversationId) {
            setPendingConversationId(null);
            setIsLoading(false);
            setIsRequestPending(false);
          }
          break;
        }

        // 继续处理响应，无论用户是否切换了对话
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              // 清除待处理对话ID
              if (pendingConversationId === activeConversationId) {
                setPendingConversationId(null);
                setIsLoading(false);
                setIsRequestPending(false);
              }
              break;
            }
            try {
              const parsed = JSON.parse(data);
              
              if (parsed.choices && parsed.choices[0].delta) {
                // 处理思维链内容
                if (parsed.choices[0].delta.reasoning_content) {
                  // 如果是思维链内容
                  const reasoningContent = parsed.choices[0].delta.reasoning_content;
                  
                  // 如果当前阶段不是reasoning，则创建新的思维链消息
                  if (currentPhase !== "reasoning") {
                    currentPhase = "reasoning";
                    reasoningResponse = reasoningContent;
                    reasoningMessageId = `reasoning-${Date.now().toString()}`;
                    
                    // 创建新的思维链消息 - 更新对应的会话
                    setConversations(prev => {
                      const updatedConversations = [...prev];
                      const targetConversation = updatedConversations.find(conv => conv.id === activeConversationId);
                      
                      if (targetConversation) {
                        // 如果找到目标会话，更新它的消息
                        const updatedMessages = [...targetConversation.messages, {
                          id: reasoningMessageId,
                          content: `思考过程：${reasoningContent}`,
                          role: "assistant" as const,
                          timestamp: new Date(),
                          type: "reasoning" as const
                        }];
                        
                        targetConversation.messages = updatedMessages;
                      }
                      
                      return updatedConversations;
                    });
                    
                    // 如果当前正在查看相同的会话，也更新当前显示的消息
                    if (currentConversationId === activeConversationId) {
                      setMessages(prev => [
                        ...prev,
                        {
                          id: reasoningMessageId,
                          content: `思考过程：${reasoningContent}`,
                          role: "assistant" as const,
                          timestamp: new Date(),
                          type: "reasoning"
                        }
                      ]);
                    }
                  } else {
                    // 已经有思维链消息，更新它
                    reasoningResponse += reasoningContent;
                    
                    // 更新会话中的消息
                    setConversations(prev => {
                      const updatedConversations = [...prev];
                      const targetConversation = updatedConversations.find(conv => conv.id === activeConversationId);
                      
                      if (targetConversation) {
                        // 如果找到目标会话，更新对应的消息
                        targetConversation.messages = targetConversation.messages.map(msg => {
                          if (msg.id === reasoningMessageId) {
                            return {
                              ...msg,
                              content: `思考过程：${reasoningResponse}`
                            };
                          }
                          return msg;
                        });
                      }
                      
                      return updatedConversations;
                    });
                    
                    // 如果当前正在查看相同的会话，也更新当前显示的消息
                    if (currentConversationId === activeConversationId) {
                      setMessages(prev => {
                        return prev.map(msg => {
                          if (msg.id === reasoningMessageId) {
                            return {
                              ...msg,
                              content: `思考过程：${reasoningResponse}`
                            };
                          }
                          return msg;
                        });
                      });
                      
                      // 对更新的思维链内容自动滚动到底部
                      setTimeout(() => scrollReasoningToBottom(reasoningMessageId), 0);
                    }
                  }
                } 
                // 处理普通回复内容
                else if (parsed.choices[0].delta.content) {
                  const content = parsed.choices[0].delta.content;
                  
                  // 如果当前阶段不是answer，则创建新的回答消息
                  if (currentPhase !== "answer") {
                    currentPhase = "answer";
                    aiResponse = content;
                    aiMessageId = `answer-${Date.now().toString()}`;
                    
                    // 创建新的回答消息 - 更新对应的会话
                    setConversations(prev => {
                      const updatedConversations = [...prev];
                      const targetConversation = updatedConversations.find(conv => conv.id === activeConversationId);
                      
                      if (targetConversation) {
                        // 如果找到目标会话，更新它的消息
                        const updatedMessages = [...targetConversation.messages, {
                          id: aiMessageId,
                          content: aiResponse,
                          role: "assistant" as const,
                          timestamp: new Date(),
                          type: "answer" as const
                        }];
                        
                        targetConversation.messages = updatedMessages;
                      }
                      
                      return updatedConversations;
                    });
                    
                    // 如果当前正在查看相同的会话，也更新当前显示的消息
                    if (currentConversationId === activeConversationId) {
                      setMessages(prev => [
                        ...prev,
                        {
                          id: aiMessageId,
                          content: aiResponse,
                          role: "assistant" as const,
                          timestamp: new Date(),
                          type: "answer"
                        }
                      ]);
                    }
                  } else {
                    // 已经有回答消息，更新它
                    aiResponse += content;
                    
                    // 更新会话中的消息
                    setConversations(prev => {
                      const updatedConversations = [...prev];
                      const targetConversation = updatedConversations.find(conv => conv.id === activeConversationId);
                      
                      if (targetConversation) {
                        // 如果找到目标会话，更新对应的消息
                        targetConversation.messages = targetConversation.messages.map(msg => {
                          if (msg.id === aiMessageId) {
                            return {
                              ...msg,
                              content: aiResponse
                            };
                          }
                          return msg;
                        });
                      }
                      
                      return updatedConversations;
                    });
                    
                    // 如果当前正在查看相同的会话，也更新当前显示的消息
                    if (currentConversationId === activeConversationId) {
                      setMessages(prev => {
                        return prev.map(msg => {
                          if (msg.id === aiMessageId) {
                            return {
                              ...msg,
                              content: aiResponse
                            };
                          }
                          return msg;
                        });
                      });
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Error parsing chunk:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // 如果不是用户主动中止请求导致的错误，才显示错误消息
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        if (pendingConversationId === activeConversationId) {
          setPendingConversationId(null);
          setIsLoading(false);
          setIsRequestPending(false);
        }
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: "抱歉，发生了错误，请稍后重试。",
          role: "assistant" as const,
          timestamp: new Date(),
        };
        
        // 更新对应会话的消息
        setConversations(prev => {
          const updatedConversations = [...prev];
          const targetConversation = updatedConversations.find(conv => conv.id === activeConversationId);
          
          if (targetConversation) {
            targetConversation.messages = [...targetConversation.messages, errorMessage];
          }
          
          return updatedConversations;
        });
        
        // 如果当前正在查看相同的会话，也更新当前显示的消息
        if (currentConversationId === activeConversationId) {
          setMessages((prev) => [...prev, errorMessage]);
        }
      }
    }
  };

  // 确认API Key
  const confirmApiKey = () => {
    if (apiKey.trim()) {
      setConfirmedApiKey(apiKey);
      // 提供确认反馈
      alert("API Key已确认设置!");
    }
  };

  // 清除API Key
  const clearApiKey = () => {
    setApiKey("");
    setConfirmedApiKey("");
    localStorage.removeItem(LOCAL_STORAGE_KEYS.API_KEY);
  };

  const startNewChat = async () => {
    // 取消正在进行的请求
    cancelOngoingRequest();
    
    // 保存当前对话到历史记录
    saveCurrentConversation();
    
    // 清空当前消息列表
    setMessages([]);
    // 重置当前会话ID
    setCurrentConversationId(null);
    // 显示一个临时提示消息
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 300);
  };

  // 保存当前对话到历史记录
  const saveCurrentConversation = () => {
    // 如果当前有消息，保存为历史会话
    if (messages.length > 0) {
      // 检查当前会话是否已经存在于历史记录中
      if (currentConversationId) {
        // 更新现有对话
        setConversations(prev => 
          prev.map(conv => 
            conv.id === currentConversationId 
              ? { ...conv, messages: messages, model: selectedModel }
              : conv
          )
        );
      } else {
        // 创建新的对话记录
        const newConversation: Conversation = {
          id: Date.now().toString(),
          title: messages[0].content.slice(0, 30) + (messages[0].content.length > 30 ? '...' : ''),
          messages: [...messages],
          model: selectedModel,
        };
        
        // 新对话添加到数组开头
        setConversations(prev => [newConversation, ...prev]);
      }
    }
  };

  const loadConversation = (conversation: Conversation) => {
    // 保存当前对话到历史记录
    saveCurrentConversation();

    // 加载选中的会话
    setMessages(conversation.messages);
    setSelectedModel(conversation.model);
    setCurrentConversationId(conversation.id);
  };

  const clearChat = () => {
    // 取消正在进行的请求
    cancelOngoingRequest();
    
    // 保存当前对话到历史记录
    saveCurrentConversation();
    
    setMessages([]);
    setCurrentConversationId(null);
  };

  // 删除历史对话
  const deleteConversation = (e: React.MouseEvent, conversationId: string) => {
    // 阻止事件冒泡，避免触发加载对话
    e.stopPropagation();
    
    // 从对话列表中删除该对话
    setConversations(prev => prev.filter(conv => conv.id !== conversationId));
    
    // 如果删除的是当前正在查看的对话，则清空当前对话
    if (currentConversationId === conversationId) {
      setMessages([]);
      setCurrentConversationId(null);
      // 取消正在进行的请求
      cancelOngoingRequest();
    }
  };

  // 过滤消息，只保留最新的有效消息用于API调用
  const getMessagesForAPI = (msgs: Message[]) => {
    // 过滤掉所有type为"reasoning"的消息
    return msgs.filter(msg => msg.type !== "reasoning");
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // 添加重命名对话功能
  const renameConversation = (conversationId: string, newTitle: string) => {
    setConversations(prev => prev.map(conv => 
      conv.id === conversationId 
        ? { ...conv, title: newTitle, isEditing: false }
        : conv
    ));
  };

  // 添加导出对话功能
  const exportConversation = (conversation: Conversation) => {
    // 创建Markdown格式的对话内容
    const markdownContent = conversation.messages.map(msg => {
      const role = msg.role === 'user' ? '用户' : 'AI';
      return `## ${role}\n\n${msg.content}\n`;
    }).join('\n');

    // 创建JSON格式的对话内容
    const jsonContent = JSON.stringify(conversation, null, 2);

    // 创建Blob对象
    const markdownBlob = new Blob([markdownContent], { type: 'text/markdown' });
    const jsonBlob = new Blob([jsonContent], { type: 'application/json' });

    // 创建下载链接
    const markdownUrl = URL.createObjectURL(markdownBlob);
    const jsonUrl = URL.createObjectURL(jsonBlob);

    // 创建并触发下载
    const markdownLink = document.createElement('a');
    markdownLink.href = markdownUrl;
    markdownLink.download = `${conversation.title}.md`;
    markdownLink.click();

    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `${conversation.title}.json`;
    jsonLink.click();

    // 清理URL对象
    URL.revokeObjectURL(markdownUrl);
    URL.revokeObjectURL(jsonUrl);
  };

  // 切换思维链的展开/收起状态
  const toggleReasoningCollapse = (messageId: string) => {
    setCollapsedReasonings(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));

    // 重置展开全部的状态
    if (!collapsedReasonings[messageId]) {
      setExpandedReasonings(prev => ({
        ...prev,
        [messageId]: false
      }));
    }
  };

  // 双击切换思维链的展开全部/收起状态
  const toggleReasoningExpand = (messageId: string, e: React.MouseEvent) => {
    // 阻止事件冒泡，避免触发收起
    e.stopPropagation();
    
    setExpandedReasonings(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));

    // 确保在触发展开时，取消折叠状态
    if (collapsedReasonings[messageId]) {
      setCollapsedReasonings(prev => ({
        ...prev,
        [messageId]: false
      }));
    }
  };

  // 定期保存当前对话状态
  useEffect(() => {
    // 如果有当前会话ID，定期更新该会话的内容
    if (currentConversationId && messages.length > 0) {
      const saveTimer = setTimeout(() => {
        setConversations(prev => 
          prev.map(conv => 
            conv.id === currentConversationId 
              ? { ...conv, messages: messages, model: selectedModel }
              : conv
          )
        );
      }, 2000); // 2秒后保存，避免频繁更新
      
      return () => clearTimeout(saveTimer);
    }
  }, [messages, currentConversationId, selectedModel]);

  // 组件卸载时，确保请求被取消
  useEffect(() => {
    return () => {
      cancelOngoingRequest();
    };
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* 侧边栏 */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-800 shadow-lg transform ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:w-72 flex flex-col`}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 flex-shrink-0">
          <h1 className="text-xl font-bold dark:text-white flex items-center">
            <svg className="w-6 h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
            </svg>
            AI Chat
          </h1>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 md:hidden"
          >
            <X size={20} className="dark:text-white" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-2"
                placeholder="输入你的 DeepSeek API Key"
              />
              <div className="flex space-x-2">
                <button
                  onClick={confirmApiKey}
                  className="flex-1 p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  确认
                </button>
                <button
                  onClick={clearApiKey}
                  className="flex-1 p-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  清除
                </button>
              </div>
              {confirmedApiKey && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  API Key已设置
                </p>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                选择模型
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {MODELS.find(m => m.id === selectedModel)?.description || ""}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 mb-4">
              <button 
                onClick={startNewChat}
                className="flex items-center w-full p-2 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-200"
              >
                <Plus size={16} className="mr-2" />
                <span className="text-sm">新对话</span>
              </button>
              <button 
                onClick={clearChat}
                className="flex items-center w-full p-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
              >
                <Trash2 size={16} className="mr-2" />
                <span className="text-sm">清除当前对话</span>
              </button>
              <button 
                onClick={toggleTheme}
                className="flex items-center w-full p-2 rounded-md bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900 dark:hover:bg-purple-800 dark:text-purple-200"
              >
                {theme === 'dark' ? (
                  <Sun size={16} className="mr-2" />
                ) : (
                  <Moon size={16} className="mr-2" />
                )}
                <span className="text-sm">{theme === 'dark' ? '浅色模式' : '深色模式'}</span>
              </button>
            </div>
          </div>
          <div className="p-4 border-t dark:border-gray-700">
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              历史对话
            </h2>
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic text-center py-2">暂无历史对话</p>
              ) : (
                conversations.map((conversation) => (
                  <div 
                    key={conversation.id}
                    className={`relative group w-full text-left p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 ${
                      currentConversationId === conversation.id ? 'bg-gray-200 dark:bg-gray-700 font-medium' : ''
                    }`}
                  >
                    {conversation.isEditing ? (
                      <input
                        type="text"
                        defaultValue={conversation.title}
                        className="w-full p-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                        onBlur={(e) => renameConversation(conversation.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            renameConversation(conversation.id, e.currentTarget.value);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => loadConversation(conversation)}
                          className="flex-1 text-left dark:text-white text-sm truncate"
                        >
                          <div className="flex items-center">
                            <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                            </svg>
                            <span className="truncate">{conversation.title}</span>
                          </div>
                        </button>
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConversations(prev => prev.map(conv => 
                                conv.id === conversation.id 
                                  ? { ...conv, isEditing: true }
                                  : conv
                              ));
                            }}
                            className="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"
                            title="重命名"
                          >
                            <Pencil size={14} className="text-gray-500 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              exportConversation(conversation);
                            }}
                            className="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"
                            title="导出对话"
                          >
                            <Download size={14} className="text-gray-500 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={(e) => deleteConversation(e, conversation.id)}
                            className="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"
                            title="删除对话"
                          >
                            <X size={14} className="text-gray-500 dark:text-gray-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* 顶部导航 */}
        <header className="bg-white dark:bg-gray-800 shadow-sm p-4 flex items-center">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-1 mr-4 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 md:hidden"
          >
            <Menu size={20} className="dark:text-white" />
          </button>
          <h2 className="text-lg font-semibold dark:text-white">
            {currentConversationId ? '历史对话' : '新对话'}
          </h2>
        </header>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <Image
                src="/next.svg"
                alt="Logo"
                width={120}
                height={120}
                className="opacity-20 dark:invert mb-4"
              />
              <p className="text-lg">开始一个新的对话吧！</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : message.type === 'reasoning'
                        ? 'bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-100 border border-yellow-300 dark:border-yellow-600'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                  } animate-fade-in`}
                >
                  {message.type === 'reasoning' ? (
                    <div className="w-full">
                      <div 
                        className="text-xs text-yellow-700 dark:text-yellow-300 mb-1 font-semibold flex items-center justify-between cursor-pointer p-1 reasoning-header"
                        onClick={() => toggleReasoningCollapse(message.id)}
                        title={collapsedReasonings[message.id] ? "展开思考过程" : "收起思考过程"}
                      >
                        <div className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"></path>
                          </svg>
                          AI思考过程
                        </div>
                        <div className="flex items-center gap-1">
                          {!collapsedReasonings[message.id] && (
                            <span className="text-xs opacity-60 hidden sm:inline">(双击展开全部)</span>
                          )}
                          {collapsedReasonings[message.id] ? 
                            <ChevronRight size={14} className="text-yellow-700 dark:text-yellow-300" /> : 
                            <ChevronDown size={14} className="text-yellow-700 dark:text-yellow-300" />
                          }
                        </div>
                      </div>
                      <div 
                        className={`border-t border-yellow-200 dark:border-yellow-800 pt-2 mt-1 whitespace-pre-wrap text-sm font-mono reasoning-container overflow-x-auto ${
                          collapsedReasonings[message.id] 
                            ? 'collapsed' 
                            : expandedReasonings[message.id]
                              ? 'reasoning-expanded max-h-[500px] overflow-y-auto' 
                              : 'max-h-36 overflow-y-auto'
                        }`}
                        ref={(el) => {
                          if (el) {
                            reasoningContentRefs.current[message.id] = el;
                            if (!collapsedReasonings[message.id]) {
                              el.scrollTop = el.scrollHeight;
                            }
                          }
                        }}
                        onDoubleClick={(e) => toggleReasoningExpand(message.id, e)}
                        title="双击切换展开/收起全部内容"
                      >
                        {message.content.replace("思考过程：", "")}
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start animate-fade-in">
              <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入区域 */}
        <div className="border-t dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder={pendingConversationId ? "正在等待回复，请稍候..." : "输入消息..."}
              className="flex-1 p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={pendingConversationId !== null || !confirmedApiKey}
            />
            <button
              onClick={handleSendMessage}
              disabled={pendingConversationId !== null || input.trim() === "" || !confirmedApiKey}
              className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </div>
          {pendingConversationId && pendingConversationId !== currentConversationId && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              正在另一个对话中等待AI回复，在回复完成前无法发送新消息
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

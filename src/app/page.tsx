"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Send, Trash2, Settings, Menu, X, Moon, Sun, Plus, History, Download, Pencil, ChevronRight, ChevronDown, Book, FilePlus, Tag, Search } from "lucide-react";
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

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  conversationId?: string;
  messageIds?: string[];
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [confirmedApiKey, setConfirmedApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [collapsedReasonings, setCollapsedReasonings] = useState<{[key: string]: boolean}>({});
  const [expandedReasonings, setExpandedReasonings] = useState<{[key: string]: boolean}>({});
  const reasoningContentRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  const [editTitle, setEditTitle] = useState("");
  const { theme, setTheme } = useTheme();
  const [isRequestPending, setIsRequestPending] = useState(false);
  const activeRequestController = useRef<AbortController | null>(null);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const abortedControllers = useRef<Set<AbortController>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 笔记相关状态
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [newTag, setNewTag] = useState("");

  // 示例问题建议
  const modelSuggestions: string[] = [
    "你能用简单的语言解释量子力学吗？",
    "请推荐5本经典科幻小说及其主要内容",
    "帮我写一个简单的React组件，显示待办事项列表",
    "解释一下神经网络是如何工作的"
  ];

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

  // 在组件挂载时从localStorage加载笔记
  useEffect(() => {
    const savedNotes = localStorage.getItem(LOCAL_STORAGE_KEYS.NOTES);
    if (savedNotes) {
      try {
        const parsedNotes = JSON.parse(savedNotes);
        // 将字符串日期转换为Date对象
        const processedNotes = parsedNotes.map((note: any) => ({
          ...note,
          createdAt: new Date(note.createdAt),
          updatedAt: new Date(note.updatedAt)
        }));
        setNotes(processedNotes);
      } catch (error) {
        console.error("Error parsing saved notes:", error);
      }
    }
  }, []);

  // 监听notes变化，保存到localStorage
  useEffect(() => {
    if (notes.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.NOTES, JSON.stringify(notes));
    }
  }, [notes]);

  // 监听消息变化，自动滚动到底部
  useEffect(() => {
    // 使用 setTimeout 确保在DOM更新后执行滚动
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);

    return () => clearTimeout(timer);
  }, [messages]);

  // 添加直接观察消息容器高度变化的监听器
  useEffect(() => {
    // 创建一个ResizeObserver来监听消息容器高度变化
    if (typeof ResizeObserver !== 'undefined' && messagesEndRef.current) {
      const messagesList = messagesEndRef.current.parentElement;
      if (messagesList) {
        const resizeObserver = new ResizeObserver(() => {
          scrollToBottom();
        });
        
        resizeObserver.observe(messagesList);
        
        // 清理函数
        return () => {
          resizeObserver.disconnect();
        };
      }
    }
  }, []);

  // 修改滚动到底部的函数，使其更可靠
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      try {
        // 使用更直接的方法来滚动到底部
        const messagesList = messagesEndRef.current.parentElement;
        if (messagesList) {
          messagesList.scrollTop = messagesList.scrollHeight;
        }
      } catch (error) {
        console.error("滚动时出错:", error);
        // 备用方法，确保可以滚动到最新消息
        try {
          messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
        } catch (e) {
          console.error("备用滚动方法失败:", e);
        }
      }
    }
  };

  // 监听思维链内容变化，自动滚动到底部
  useEffect(() => {
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

    // 尝试次数
    let retryCount = 0;
    const maxRetries = 3;
    
    // 异步获取API响应
    const getAPIResponse = async () => {
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
          throw new Error('API请求失败: ' + response.statusText);
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
                        // 确保在添加新消息后立即滚动到底部
                        requestAnimationFrame(() => scrollToBottom());
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
                          const updatedMessages = prev.map(msg => {
                            if (msg.id === reasoningMessageId) {
                              return {
                                ...msg,
                                content: `思考过程：${reasoningResponse}`
                              };
                            }
                            return msg;
                          });
                          return updatedMessages;
                        });
                        // 在内容更新后立即滚动到底部
                        requestAnimationFrame(() => scrollToBottom());
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
                            type: "answer" as const
                          }
                        ]);
                        // 确保在添加新消息后立即滚动到底部 
                        requestAnimationFrame(() => scrollToBottom());
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
                          const updatedMessages = prev.map(msg => {
                            if (msg.id === aiMessageId) {
                              return {
                                ...msg,
                                content: aiResponse
                              };
                            }
                            return msg;
                          });
                          return updatedMessages;
                        });
                        // 在内容更新后立即滚动到底部
                        requestAnimationFrame(() => scrollToBottom());
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
      } catch (error: any) {
        // 出现错误，清空之前创建的空消息
        console.error("Error sending message:", error);
        
        // 连接错误且没有超过最大重试次数，尝试重新连接
        if ((error.name === 'TypeError' || 
             error.message?.includes('network') || 
             error.message?.includes('socket') ||
             error.message?.includes('failed') ||
             error.message?.includes('terminated')) && 
            retryCount < maxRetries && 
            !controller.signal.aborted) {
          
          retryCount++;
          console.log(`连接错误，正在尝试第 ${retryCount} 次重试...`);
          
          // 添加重试提示消息
          setMessages(prev => {
            // 移除上一个重试消息（如果有）
            const filtered = prev.filter(msg => !msg.id.includes('retry-message'));
            return [...filtered, {
              id: `retry-message-${Date.now()}`,
              content: `网络连接中断，正在尝试第 ${retryCount} 次重试...`,
              role: "assistant",
              timestamp: new Date(),
              type: "answer"
            }];
          });
          
          // 延迟一段时间后重试
          setTimeout(() => {
            if (!controller.signal.aborted) {
              getAPIResponse();
            }
          }, 1000 * retryCount); // 递增重试延迟
          return;
        }
        
        // 如果不是用户主动中止请求导致的错误，才显示错误消息
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          if (pendingConversationId === activeConversationId) {
            setPendingConversationId(null);
            setIsLoading(false);
            setIsRequestPending(false);
          }
          
          // 创建错误消息并显示详细信息
          const errorMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: `抱歉，发生了错误：${error.message || '未知错误'}。请稍后重试。`,
            role: "assistant" as const,
            timestamp: new Date(),
            type: "answer"
          };
          
          // 更新对应会话的消息
          setConversations(prev => {
            const updatedConversations = [...prev];
            const targetConversation = updatedConversations.find(conv => conv.id === activeConversationId);
            
            if (targetConversation) {
              // 移除所有重试消息
              targetConversation.messages = targetConversation.messages
                .filter(msg => !msg.id.includes('retry-message'))
                .concat(errorMessage);
            }
            
            return updatedConversations;
          });
          
          // 如果当前正在查看相同的会话，也更新当前显示的消息
          if (currentConversationId === activeConversationId) {
            setMessages(prev => {
              // 移除所有重试消息
              const filtered = prev.filter(msg => !msg.id.includes('retry-message'));
              return [...filtered, errorMessage];
            });
          }
        }
      }
    };
    
    // 开始执行
    getAPIResponse();
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

  // 创建新笔记
  const createNewNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: "新笔记",
      content: "",
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      conversationId: currentConversationId || undefined
    };
    
    setNotes(prev => [newNote, ...prev]);
    setSelectedNote(newNote);
    setNoteTitle(newNote.title);
    setNoteContent(newNote.content);
    setNoteTags(newNote.tags);
    setIsEditingNote(true);
    setShowNotes(true);
  };

  // 选择笔记
  const selectNote = (note: Note) => {
    setSelectedNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteTags(note.tags);
    setIsEditingNote(false);
  };

  // 编辑笔记
  const startEditingNote = () => {
    if (selectedNote) {
      setIsEditingNote(true);
    }
  };

  // 保存笔记
  const saveNote = () => {
    if (selectedNote) {
      const updatedNote = {
        ...selectedNote,
        title: noteTitle.trim() || "无标题笔记",
        content: noteContent,
        tags: noteTags,
        updatedAt: new Date()
      };
      
      setNotes(prev => 
        prev.map(note => 
          note.id === selectedNote.id ? updatedNote : note
        )
      );
      
      setSelectedNote(updatedNote);
      setIsEditingNote(false);
    }
  };

  // 删除笔记
  const deleteNote = (noteId: string) => {
    setNotes(prev => prev.filter(note => note.id !== noteId));
    if (selectedNote && selectedNote.id === noteId) {
      setSelectedNote(null);
      setNoteTitle("");
      setNoteContent("");
      setNoteTags([]);
    }
  };

  // 添加标签
  const addTag = () => {
    if (newTag.trim() && !noteTags.includes(newTag.trim())) {
      setNoteTags(prev => [...prev, newTag.trim()]);
      setNewTag("");
    }
  };

  // 删除标签
  const removeTag = (tag: string) => {
    setNoteTags(prev => prev.filter(t => t !== tag));
  };

  // 从对话中添加内容到笔记
  const addToNote = (content: string, messageId: string) => {
    if (selectedNote) {
      const updatedContent = noteContent 
        ? `${noteContent}\n\n---\n\n${content}` 
        : content;
      
      const updatedMessageIds = selectedNote.messageIds 
        ? [...selectedNote.messageIds, messageId]
        : [messageId];
      
      const updatedNote = {
        ...selectedNote,
        content: updatedContent,
        messageIds: updatedMessageIds,
        updatedAt: new Date()
      };
      
      setNotes(prev => 
        prev.map(note => 
          note.id === selectedNote.id ? updatedNote : note
        )
      );
      
      setSelectedNote(updatedNote);
      setNoteContent(updatedContent);
    } else {
      // 如果没有选中的笔记，创建一个新笔记
      const newNote: Note = {
        id: Date.now().toString(),
        title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
        content: content,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        conversationId: currentConversationId || undefined,
        messageIds: [messageId]
      };
      
      setNotes(prev => [newNote, ...prev]);
      setSelectedNote(newNote);
      setNoteTitle(newNote.title);
      setNoteContent(newNote.content);
      setNoteTags([]);
      setIsEditingNote(true);
      setShowNotes(true);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      {/* 侧边栏 */}
      <div className={`w-72 h-full bg-white dark:bg-gray-800 shadow-md flex flex-col ${isSidebarOpen ? 'block' : 'hidden md:flex'}`}>
        {/* 侧边栏头部 */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-500"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span className="text-lg font-semibold">AI Chat</span>
          </div>
          <button className="md:hidden" onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>
        
        {/* 操作按钮 */}
        <div className="p-2 grid grid-cols-2 gap-2">
          <button 
            onClick={startNewChat}
            className="flex items-center justify-center space-x-2 p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
          >
            <Plus size={16} />
            <span>新对话</span>
          </button>
          
          <button 
            onClick={() => setShowNotes(!showNotes)}
            className={`flex items-center justify-center space-x-2 p-2 ${
              showNotes 
                ? 'bg-yellow-500 hover:bg-yellow-600 text-white' 
                : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600'
            } rounded-md transition-colors`}
          >
            <Book size={16} />
            <span>笔记</span>
          </button>
        </div>
        
        {/* 内容区域 - 动态切换显示历史对话或笔记 */}
        <div className="flex-1 overflow-y-auto">
          {showNotes ? (
            // 笔记列表
            <div className="p-3">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-md font-semibold flex items-center">
                  <Book size={16} className="mr-2" />
                  我的笔记
                </h3>
                <button
                  onClick={createNewNote}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                  title="新建笔记"
                >
                  <FilePlus size={16} />
                </button>
              </div>
              
              {notes.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Book size={40} className="mx-auto mb-2 opacity-20" />
                  <p>还没有笔记</p>
                  <button
                    onClick={createNewNote}
                    className="mt-2 p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                  >
                    创建第一条笔记
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map(note => (
                    <div
                      key={note.id}
                      onClick={() => selectNote(note)}
                      className={`p-2 rounded-md cursor-pointer transition-colors ${
                        selectedNote && selectedNote.id === note.id
                          ? 'bg-blue-100 dark:bg-blue-900'
                          : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <h4 className="font-medium text-sm truncate flex-1">
                          {note.title}
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNote(note.id);
                          }}
                          className="p-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                        {note.content.slice(0, 60) + (note.content.length > 60 ? '...' : '')}
                      </p>
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {note.tags.slice(0, 2).map(tag => (
                            <span
                              key={tag}
                              className="text-xs bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                          {note.tags.length > 2 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{note.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(note.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // 对话历史列表
            <div className="p-3">
              <div className="flex items-center mb-2">
                <History size={16} className="mr-2" />
                <span className="text-md font-semibold">历史对话</span>
              </div>
              
              {/* 历史对话列表 */}
              {conversations.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <History size={40} className="mx-auto mb-2 opacity-20" />
                  <p>还没有历史对话</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`p-2 rounded-md cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                        currentConversationId === conversation.id ? 'bg-blue-100 dark:bg-blue-900' : ''
                      }`}
                      onClick={() => loadConversation(conversation)}
                    >
                      <div className="flex justify-between items-center">
                        {conversation.isEditing ? (
                          <input
                            type="text"
                            value={conversation.title}
                            onChange={(e) => renameConversation(conversation.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                renameConversation(conversation.id, e.currentTarget.value);
                              }
                            }}
                            className="flex-1 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                            autoFocus
                          />
                        ) : (
                          <span className="flex-1 truncate">
                            {conversation.title}
                          </span>
                        )}
                        <div className="flex items-center ml-2">
                          {conversation.isEditing ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                renameConversation(conversation.id, e.currentTarget.value);
                              }}
                              className="p-1 text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConversations(prev => prev.map(conv => 
                                    conv.id === conversation.id 
                                      ? { ...conv, isEditing: true }
                                      : conv
                                  ));
                                }}
                                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={(e) => deleteConversation(e, conversation.id)}
                                className="p-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        模型: {conversation.model}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* 顶部栏 */}
        <div className="bg-white dark:bg-gray-800 p-4 shadow-sm border-b dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center">
            <button
              className="md:hidden mr-2"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            <div>
              <h1 className="text-xl font-semibold">
                {currentConversationId 
                  ? conversations.find(c => c.id === currentConversationId)?.title || "AI Chat" 
                  : "新对话"}
              </h1>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                当前模型: {selectedModel}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearChat}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
              title="清除对话"
            >
              <Trash2 size={20} />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
              title={theme === 'dark' ? "切换到浅色模式" : "切换到深色模式"}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
              title="设置"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
        
        {/* 设置面板 */}
        {showSettings && (
          <div className="absolute right-0 top-16 w-80 bg-white dark:bg-gray-800 shadow-lg rounded-l-lg z-50 border dark:border-gray-700 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold flex items-center">
                <Settings size={18} className="mr-2" />
                设置
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 mb-2"
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
                <label className="block text-sm font-medium mb-2 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  选择模型
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
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
              
              <div className="border-t dark:border-gray-700 pt-4 mt-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  应用信息
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  版本: 1.0.0
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  如有问题请联系开发者
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 主内容（分为对话和笔记区域） */}
        <div className="flex-1 flex overflow-hidden">
          {/* 对话区域 */}
          <div className={`flex-1 flex flex-col ${showNotes && selectedNote ? 'md:w-1/2' : 'w-full'}`}>
            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 mb-4 rounded-full bg-blue-500 flex items-center justify-center text-white">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold mb-2">开始一个新对话</h2>
                  <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
                    输入一个问题或者描述，AI助手会为你生成回复。
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-lg">
                    {modelSuggestions.map((suggestion: string, index: number) => (
                      <button
                        key={index}
                        onClick={() => setInput(suggestion)}
                        className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 text-left text-sm"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`mb-4 ${
                      message.role === "user" ? "flex justify-end" : "flex justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-3xl rounded-lg p-3 ${
                        message.role === "user"
                          ? "bg-blue-500 text-white rounded-br-none"
                          : message.type === "reasoning"
                          ? "bg-yellow-50 dark:bg-yellow-900 dark:bg-opacity-30 text-yellow-800 dark:text-yellow-200 rounded-tl-none"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none"
                      }`}
                    >
                      {message.type === "reasoning" ? (
                        <div>
                          <div 
                            className="text-xs italic cursor-pointer reasoning-header flex justify-between items-center" 
                            onClick={() => toggleReasoningCollapse(message.id)}
                          >
                            <div className="flex items-center">
                              {collapsedReasonings[message.id] ? 
                                <ChevronRight size={14} className="text-yellow-700 dark:text-yellow-300" /> : 
                                <ChevronDown size={14} className="text-yellow-700 dark:text-yellow-300" />
                              }
                              <span className="ml-1">思考过程</span>
                            </div>
                            <div className="flex items-center">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToNote(message.content.replace("思考过程：", ""), message.id);
                                }}
                                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 p-1"
                                title="添加到笔记"
                              >
                                <Book size={12} />
                              </button>
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
                        <div className="whitespace-pre-wrap">
                          {message.content}
                          {message.role === "assistant" && message.type === "answer" && (
                            <div className="flex justify-end mt-2">
                              <button 
                                onClick={() => addToNote(message.content, message.id)}
                                className="text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 p-1"
                                title="添加到笔记"
                              >
                                <Book size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start mb-4">
                  <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-3 rounded-tl-none">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"></div>
                      <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                      <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                    </div>
                  </div>
                </div>
              )}
              {/* 添加一个空的div，用于滚动定位 */}
              <div ref={messagesEndRef}></div>
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

          {/* 笔记区域 - 仅在笔记模式且有选中笔记时显示 */}
          {showNotes && selectedNote && (
            <div className="hidden md:flex flex-col w-1/2 border-l dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="p-4 border-b dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold flex items-center">
                    <Book size={18} className="mr-2" />
                    {isEditingNote ? "编辑笔记" : "查看笔记"}
                  </h2>
                  <div className="flex space-x-2">
                    {isEditingNote ? (
                      <>
                        <button
                          onClick={saveNote}
                          className="p-1.5 bg-green-500 text-white rounded-md hover:bg-green-600"
                          title="保存"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setNoteTitle(selectedNote.title);
                            setNoteContent(selectedNote.content);
                            setNoteTags(selectedNote.tags);
                            setIsEditingNote(false);
                          }}
                          className="p-1.5 bg-gray-300 dark:bg-gray-600 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
                          title="取消"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={startEditingNote}
                          className="p-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                          title="编辑"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => {
                            deleteNote(selectedNote.id);
                            setShowNotes(notes.length <= 1 ? false : true);
                          }}
                          className="p-1.5 bg-red-500 text-white rounded-md hover:bg-red-600"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                {isEditingNote ? (
                  <div className="flex flex-col h-full">
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      className="w-full p-2 mb-3 border rounded-md dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="笔记标题..."
                    />
                    
                    <div className="flex items-center mb-3">
                      <div className="flex items-center flex-1 space-x-2">
                        <Tag size={16} className="text-gray-500" />
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyPress={(e) => e.key === "Enter" && addTag()}
                          className="flex-1 p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="添加标签..."
                        />
                        <button
                          onClick={addTag}
                          className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          添加
                        </button>
                      </div>
                    </div>
                    
                    {noteTags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {noteTags.map(tag => (
                          <div 
                            key={tag} 
                            className="flex items-center bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full"
                          >
                            <span className="text-sm">{tag}</span>
                            <button
                              onClick={() => removeTag(tag)}
                              className="ml-1 text-gray-500 hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      className="flex-1 w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="笔记内容..."
                    />
                  </div>
                ) : (
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{selectedNote.title}</h3>
                    
                    {selectedNote.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {selectedNote.tags.map(tag => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                      最后编辑: {new Date(selectedNote.updatedAt).toLocaleString()}
                    </div>
                    
                    <div className="whitespace-pre-wrap">
                      {selectedNote.content}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

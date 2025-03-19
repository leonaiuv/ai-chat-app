export const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export const MODELS = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    description: "基础聊天模型",
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    description: "推理增强模型，会显示思考过程",
  },
];

export const LOCAL_STORAGE_KEYS = {
  MESSAGES: "deepseek-chat-messages",
  API_KEY: "deepseek-api-key",
  SELECTED_MODEL: "deepseek-selected-model",
  CONVERSATIONS: "deepseek-conversations",
  NOTES: "notes"
}; 
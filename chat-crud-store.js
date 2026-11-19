// ── Full Chat CRUD & History Storage Engine ──
const ChatStore = {
  getHistory() {
    try {
      return JSON.parse(localStorage.getItem("portfolio_ai_chat_history")) || [];
    } catch (e) {
      return [];
    }
  },
  saveHistory(history) {
    localStorage.setItem("portfolio_ai_chat_history", JSON.stringify(history));
  },
  addMessage(role, text, id = null) {
    const history = this.getHistory();
    const msg = {
      id: id || "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      role: role,
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    history.push(msg);
    this.saveHistory(history);
    return msg;
  },
  updateMessage(id, newText) {
    const history = this.getHistory();
    const item = history.find(m => m.id === id);
    if (item) {
      item.text = newText;
      item.edited = true;
      this.saveHistory(history);
    }
  },
  deleteMessage(id) {
    const history = this.getHistory().filter(m => m.id !== id);
    this.saveHistory(history);
  },
  clearHistory() {
    localStorage.removeItem("portfolio_ai_chat_history");
  }
};

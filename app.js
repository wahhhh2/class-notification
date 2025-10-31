// 消息存储服务
class MessageStorage {
  constructor() {}

  // 保存发送的消息
  saveMessage(message) {
    const messages = this.getSentMessages();
    messages.push(message);
    localStorage.setItem('sent_messages', JSON.stringify(messages));
  }

  // 保存接收的消息
  saveReceivedMessage(message) {
    const messages = this.getReceivedMessages();
    
    // 检查消息是否已存在
    const existingIndex = messages.findIndex(m => m.id === message.id);
    if (existingIndex >= 0) {
      messages[existingIndex] = { ...messages[existingIndex], ...message };
    } else {
      messages.push(message);
      // 限制消息数量
      if (messages.length > 100) {
        messages.shift();
      }
    }
    
    localStorage.setItem('received_messages', JSON.stringify(messages));
  }

  // 保存已读回执
  saveReadReceipt(receipt) {
    const receipts = this.getReadReceipts();
    receipts.push(receipt);
    localStorage.setItem('read_receipts', JSON.stringify(receipts));

    // 更新接收端消息状态
    const receivedMessages = this.getReceivedMessages();
    const msgIndex = receivedMessages.findIndex(m => m.id === receipt.messageId);
    if (msgIndex >= 0) {
      receivedMessages[msgIndex].status = 'read';
      localStorage.setItem('received_messages', JSON.stringify(receivedMessages));
    }

    // 如果是在发送端，更新发送的消息状态
    this.updateSentMessageWithReceipt(receipt);
  }

  // 更新发送消息的回执
  updateSentMessageWithReceipt(receipt) {
    const sentMessages = this.getSentMessages();
    const msgIndex = sentMessages.findIndex(m => m.id === receipt.messageId);
    
    if (msgIndex >= 0) {
      if (!sentMessages[msgIndex].readReceipts) {
        sentMessages[msgIndex].readReceipts = [];
      }
      
      // 避免重复添加
      if (!sentMessages[msgIndex].readReceipts.find(r => r.receiverId === receipt.receiverId)) {
        sentMessages[msgIndex].readReceipts.push(receipt);
        
        // 更新状态为已送达
        if (sentMessages[msgIndex].status !== 'delivered' && sentMessages[msgIndex].status !== 'read') {
          sentMessages[msgIndex].status = 'delivered';
        }
        
        localStorage.setItem('sent_messages', JSON.stringify(sentMessages));
      }
    }
  }

  // 获取所有发送的消息
  getSentMessages() {
    return JSON.parse(localStorage.getItem('sent_messages') || '[]');
  }

  // 获取所有接收的消息
  getReceivedMessages() {
    return JSON.parse(localStorage.getItem('received_messages') || '[]');
  }

  // 获取所有已读回执
  getReadReceipts() {
    return JSON.parse(localStorage.getItem('read_receipts') || '[]');
  }

  // 根据ID获取消息
  getMessageById(messageId) {
    const messages = this.getSentMessages();
    return messages.find(m => m.id === messageId);
  }

  // 更新发送消息的状态
  updateSentMessageStatus(messageId, updates) {
    const messages = this.getSentMessages();
    const messageIndex = messages.findIndex(m => m.id === messageId);
    
    if (messageIndex >= 0) {
      messages[messageIndex] = { ...messages[messageIndex], ...updates };
      localStorage.setItem('sent_messages', JSON.stringify(messages));
      return true;
    }
    
    return false;
  }

  // 清空所有消息
  clearAllData() {
    localStorage.removeItem('sent_messages');
    localStorage.removeItem('received_messages');
    localStorage.removeItem('read_receipts');
    localStorage.removeItem('registeredDevices');
  }
}

// 设备管理接口（保留以供后续扩展）
class DeviceManager {
  constructor() {
    // 保留接口但简化实现
  }

  // 获取所有设备（保留接口）
  getAllDevices() {
    return [];
  }

  // 根据ID获取设备（保留接口）
  getDeviceById(deviceId) {
    return null;
  }

  // 其他设备管理方法保留但返回默认值，供后续扩展
  registerDevice(device) { return { id: 'default', name: '默认设备' }; }
  updateDevice(deviceId, updates) { return false; }
  deleteDevice(deviceId) { return false; }
}

// 消息发送器
class MessageSender {
  constructor() {
    this.messageStore = new MessageStorage();
    this.deviceManager = new DeviceManager();
    this.statusPollIntervals = {};
  }

  // 发送消息（简化版，不再需要接收者ID列表）
  sendMessage(content) {
    const message = {
      id: "msg_" + Date.now(),
      content: content,
      sender: localStorage.getItem('teacherName') || '教师',
      timestamp: Date.now(),
      status: "sent",
      readReceipts: []
    };
    
    // 保存到本地存储
    this.messageStore.saveMessage(message);
    
    return {
      success: true,
      messageId: message.id,
      message: message
    };
  }
  
  // 广播消息到所有接收端（通过localStorage事件实现）
  broadcastMessage(message) {
    // 存储消息到特定key，触发其他窗口的storage事件
    const broadcastKey = 'broadcast_message';
    localStorage.setItem(broadcastKey, JSON.stringify({
      message: message,
      timestamp: Date.now()
    }));
    
    // 立即移除，避免重复触发
    setTimeout(() => {
      localStorage.removeItem(broadcastKey);
    }, 100);
  }

  // 轮询检查消息状态
  checkMessageStatus(messageId, callback) {
    // 先清除可能存在的旧轮询
    if (this.statusPollIntervals[messageId]) {
      clearInterval(this.statusPollIntervals[messageId]);
    }
    
    // 开始新的轮询
    this.statusPollIntervals[messageId] = setInterval(() => {
      const message = this.messageStore.getMessageById(messageId);
      if (message && callback) {
        callback(message);
        
        // 如果所有接收端都已读，停止轮询
        if (message.status === 'read') {
          clearInterval(this.statusPollIntervals[messageId]);
          delete this.statusPollIntervals[messageId];
        }
      }
    }, 3000); // 每3秒检查一次
    
    return this.statusPollIntervals[messageId];
  }

  // 停止轮询
  stopCheckingStatus(messageId) {
    if (this.statusPollIntervals[messageId]) {
      clearInterval(this.statusPollIntervals[messageId]);
      delete this.statusPollIntervals[messageId];
      return true;
    }
    return false;
  }

  // 处理URL中的回执信息
  processReadReceiptFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'read_receipt') {
      const receipt = {
        receiverId: urlParams.get('receiverId'),
        messageId: urlParams.get('messageId'),
        readTime: parseInt(urlParams.get('timestamp')),
        deviceInfo: urlParams.get('deviceInfo') || 'unknown'
      };
      
      this.messageStore.saveReadReceipt(receipt);
      
      // 清空URL参数
      window.history.replaceState({}, document.title, window.location.pathname);
      
      return receipt;
    }
    return null;
  }
}

// 消息接收器
class MessageReceiver {
  constructor() {
    this.messageStore = new MessageStorage();
    this.deviceId = this.getOrCreateDeviceId();
    this.setupRealTimeSync();
  }

  // 获取或创建设备ID
  getOrCreateDeviceId() {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = "classroom_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  // 设置实时同步机制
  setupRealTimeSync() {
    // 监听localStorage变化，实现实时消息接收
    window.addEventListener('storage', (event) => {
      if (event.key === 'broadcast_message' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue);
          if (data && data.message) {
            // 保存新消息
            const message = {
              id: data.message.id,
              content: data.message.content,
              sender: data.message.sender,
              timestamp: data.message.timestamp,
              status: "delivered",
              receivedAt: new Date().toLocaleString('zh-CN')
            };
            
            this.messageStore.saveReceivedMessage(message);
            
            // 触发消息更新事件
            const event = new CustomEvent('newMessage', { detail: { message: message } });
            window.dispatchEvent(event);
          }
        } catch (e) {
          console.error('解析广播消息失败:', e);
        }
      }
    });
  }



  // 发送已读确认
  sendReadReceipt(messageId) {
    if (!messageId) return null;
    
    const receipt = {
      receiverId: this.deviceId,
      messageId: messageId,
      readTime: Date.now(),
      deviceInfo: navigator.userAgent
    };
    
    // 保存确认记录
    this.messageStore.saveReadReceipt(receipt);
    
    // 生成反馈URL（用于发送端获取状态）
    const feedbackUrl = this.generateFeedbackUrl(receipt);
    
    // 尝试通过Image对象发送回执到发送端
    this.sendReceiptToSender(feedbackUrl);
    
    return receipt;
  }

  // 生成反馈URL
  generateFeedbackUrl(receipt) {
    const baseUrl = window.location.origin + window.location.pathname.replace('receive.html', 'send.html');
    const params = new URLSearchParams({
      action: 'read_receipt',
      messageId: receipt.messageId,
      receiverId: receipt.receiverId,
      timestamp: receipt.readTime,
      deviceInfo: encodeURIComponent(receipt.deviceInfo)
    });
    return `${baseUrl}?${params.toString()}`;
  }

  // 发送回执到发送端
  sendReceiptToSender(feedbackUrl) {
    // 使用Image对象发送回执，不需要用户交互
    const img = new Image();
    img.src = feedbackUrl;
    img.onload = img.onerror = function() {
      console.log('回执已发送');
    };
  }

  // 获取所有消息（按时间顺序）
  getAllMessages() {
    return this.messageStore.getReceivedMessages()
      .sort((a, b) => b.timestamp - a.timestamp); // 按时间倒序排列，最新的在前面
  }
}

// 发送端初始化函数
function initSendApp() {
  const messageSender = new MessageSender();
  
  // 处理教师姓名
  const teacherNameInput = document.getElementById('teacherName');
  const savedTeacherName = localStorage.getItem('teacherName');
  if (savedTeacherName) {
    teacherNameInput.value = savedTeacherName;
  }
  
  teacherNameInput.addEventListener('blur', function() {
    localStorage.setItem('teacherName', this.value);
  });
  
  // 加载历史消息
  function loadHistoryMessages() {
    const historyElement = document.getElementById('historyMessages');
    const messages = messageSender.messageStore.getSentMessages().reverse();
    
    historyElement.innerHTML = '';
    
    if (messages.length === 0) {
      historyElement.innerHTML = '<p class="empty-message">暂无历史消息</p>';
      return;
    }
    
    messages.forEach(message => {
      const messageItem = document.createElement('div');
      messageItem.className = 'history-message-item';
      
      let statusText = '发送中';
      let statusClass = 'status-sent';
      let receiptText = '';
      
      if (message.status === 'delivered') {
        statusText = '已送达';
        statusClass = 'status-delivered';
      } else if (message.readReceipts && message.readReceipts.length > 0) {
        statusText = '有已读回执';
        statusClass = 'status-read';
        receiptText = `${message.readReceipts.length} 个设备已读`;
      }
      
      messageItem.innerHTML = `
        <div class="history-message-header">
          <span class="history-message-sender">${message.sender}</span>
          <span class="history-message-time">${new Date(message.timestamp).toLocaleString('zh-CN')}</span>
        </div>
        <div class="history-message-content">${message.content}</div>
        <div class="history-message-status">
          <span class="${statusClass}">${statusText}</span>
          ${receiptText ? ' | ' + receiptText : ''}
        </div>
      `;
      
      historyElement.appendChild(messageItem);
    });
  }
  
  // 显示消息状态
  function showMessageStatus(message) {
    const statusSection = document.getElementById('statusSection');
    const messageIdElement = document.getElementById('messageId');
    const sendTimeElement = document.getElementById('sendTime');
    const messageStatusElement = document.getElementById('messageStatus');
    
    messageIdElement.textContent = message.id;
    sendTimeElement.textContent = new Date(message.timestamp).toLocaleString('zh-CN');
    messageStatusElement.textContent = '发送中...';
    messageStatusElement.className = 'status-sent';
    
    statusSection.classList.remove('hidden');
    
    // 开始轮询检查状态
    messageSender.checkMessageStatus(message.id, function(updatedMessage) {
      updateMessageStatus(updatedMessage);
    });
  }
  
  // 更新消息状态
  function updateMessageStatus(message) {
    const messageStatusElement = document.getElementById('messageStatus');
    const receiptListElement = document.getElementById('receiptList');
    
    let statusText = '发送中';
    let statusClass = 'status-sent';
    
    if (message.status === 'delivered') {
      statusText = '已送达';
      statusClass = 'status-delivered';
    } else if (message.readReceipts && message.readReceipts.length > 0) {
      statusText = '有已读回执';
      statusClass = 'status-read';
    }
    
    messageStatusElement.textContent = statusText;
    messageStatusElement.className = statusClass;
    
    // 更新回执列表
    receiptListElement.innerHTML = '';
    
    if (message.readReceipts && message.readReceipts.length > 0) {
      message.readReceipts.forEach(receipt => {
        const receiptItem = document.createElement('div');
        receiptItem.className = 'receipt-item';
        receiptItem.innerHTML = `
          <span>设备 ${receipt.receiverId.substring(0, 8)}...</span>
          <span>${new Date(receipt.readTime).toLocaleString('zh-CN')}</span>
        `;
        receiptListElement.appendChild(receiptItem);
      });
    } else {
      receiptListElement.innerHTML = '<p class="empty-message">暂无已读回执</p>';
    }
  }
  

  
  // 发送消息
  document.getElementById('sendBtn').addEventListener('click', function() {
    const messageContent = document.getElementById('messageContent').value.trim();
    
    if (!messageContent) {
      alert('请输入通知内容');
      return;
    }
    
    const result = messageSender.sendMessage(messageContent);
    if (result.success) {
      // 广播消息到所有接收端
      messageSender.broadcastMessage(result.message);
      
      showMessageStatus(result.message);
      document.getElementById('messageContent').value = '';
      loadHistoryMessages();
    }
  });
  
  // 处理URL中的回执信息
  messageSender.processReadReceiptFromUrl();
  
  // 初始化页面
  loadHistoryMessages();
}

// 接收端初始化函数
function initReceiveApp() {
  const messageReceiver = new MessageReceiver();
  
  // 显示设备ID
  document.getElementById('currentDeviceId').textContent = messageReceiver.deviceId;
  
  // 渲染所有消息（按时间顺序）
  function renderAllMessages() {
    const messagesContainer = document.getElementById('messagesContainer');
    const messages = messageReceiver.getAllMessages();
    
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
      messagesContainer.innerHTML = '<p class="empty-message">暂无通知消息</p>';
      return;
    }
    
    messages.forEach(message => {
      const messageCard = document.createElement('div');
      messageCard.className = 'message-card';
      messageCard.dataset.messageId = message.id;
      
      const isRead = message.status === 'read';
      
      messageCard.innerHTML = `
        <div class="message-header">
          <span class="message-sender">${message.sender}</span>
          <span class="message-time">${new Date(message.timestamp).toLocaleString('zh-CN')}</span>
        </div>
        <div class="message-content">${message.content}</div>
        <div class="message-footer">
          <button class="receive-btn ${isRead ? 'confirmed' : ''}">
            ${isRead ? '已收到' : '收到'}
          </button>
        </div>
      `;
      
      messagesContainer.appendChild(messageCard);
      
      // 绑定收到按钮事件
      const receiveBtn = messageCard.querySelector('.receive-btn');
      receiveBtn.addEventListener('click', function() {
        if (this.classList.contains('confirmed')) return;
        
        const receipt = messageReceiver.sendReadReceipt(message.id);
        if (receipt) {
          this.textContent = '已收到';
          this.classList.add('confirmed');
          
          // 更新消息状态
          message.status = 'read';
        }
      });
    });
  }
  
  // 监听新消息事件
  window.addEventListener('newMessage', function(event) {
    renderAllMessages();
    
    // 可以添加消息提示或其他交互
    const newMsg = event.detail.message;
    console.log('收到新消息:', newMsg);
  });
  
  // 直接渲染所有历史消息
  renderAllMessages();
  
  // 定期更新消息列表
  setInterval(() => {
    renderAllMessages();
  }, 5000); // 每5秒更新一次，确保消息同步
}

// 通用工具函数
function formatTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
let selectedText = '';

// 添加浏览器兼容性检查
const isBrowserSupported = () => {
  try {
    return typeof chrome !== 'undefined' && 
           chrome.contextMenus && 
           chrome.i18n && 
           chrome.storage;
  } catch (e) {
    console.error('浏览器兼容性检查失败:', e);
    return false;
  }
};

// 创建右键菜单
chrome.runtime.onInstalled.addListener(async () => {
  try {
    if (!isBrowserSupported()) {
      throw new Error('当前浏览器不支持所需API');
    }

    console.log('===== 扩展初始化 =====');
    
    // 使用 Promise 包装存储操作
    const getLanguageSetting = () => new Promise((resolve) => {
      chrome.storage.sync.get(['language'], (result) => {
        resolve(result.language || chrome.i18n.getUILanguage().split('-')[0]);
      });
    });

    const currentLang = await getLanguageSetting();
    
    // 创建右键菜单
    chrome.contextMenus.create({
      id: 'saveText',
      title: chrome.i18n.getMessage('contextMenuTitle'),
      contexts: ['selection']
    }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('创建右键菜单失败:', error);
      }
    });
  } catch (error) {
    console.error('初始化失败:', error);
  }
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log(`===== 标签页更新 [${tabId}] =====`);
    console.log('当前标签页 URL:', tab.url);
  }
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`===== 标签页关闭 [${tabId}] =====`);
});

// 监听内容脚本状态
chrome.runtime.onMessage.addListener((message, sender) => {
  console.log('===== 收到消息 =====');
  console.log('background.js 收到消息:', message);
  console.log('消息来源:', sender);
  
  return true;
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('右键菜单被点击:', {
    menuItemId: info.menuItemId,
    tabId: tab.id,
    url: tab.url,
    text: info.selectionText?.substring(0, 50) + '...'
  });
  
  // 检查是否是受限页面
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    console.log('无法在浏览器内部页面使用此功能');
    return;
  }

  if (info.menuItemId === 'saveText') {
    try {
      // 先检查当前标签页
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        console.log('当前活动标签页:', activeTab);
        
        // 确保内容脚本已注入
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          function: () => {
            return window.hasRunContentScript === true;
          }
        }).then(results => {
          const isContentScriptLoaded = results[0]?.result;
          console.log('内容脚本状态:', isContentScriptLoaded);
          
          if (!isContentScriptLoaded) {
            // 重新注入内容脚本
            return chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              files: ['content.js']
            });
          }
        }).then(() => {
          // 发送消息
          chrome.tabs.sendMessage(tab.id, {
            action: 'showSaveDialog',
            text: info.selectionText
          }).catch(error => {
            console.error('发送消息失败:', error);
          });
        });
      });
    } catch (error) {
      console.error('处理右键菜单点击时出错:', error);
    }
  }
});

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  
  if (request.action === "showPathSelector") {
    // 打开系统文件选择器
    chrome.windows.create({
      url: 'file-picker.html',
      type: 'popup',
      width: 800,
      height: 600
    }, (window) => {
      // 存储当前的选择器窗口信息
      chrome.storage.local.set({
        pickerWindow: {
          id: window.id,
          tabId: sender.tab.id,
          lastPath: request.lastPath
        }
      });
    });
    return true;
  }
  
  if (request.action === "listDirectory" || 
      request.action === "saveToFile" || 
      request.action === "ensureDirectory") {
    // 转发消息给本地应用
    chrome.runtime.sendNativeMessage(
      'com.example.text_saver',
      request,
      response => {
        if (chrome.runtime.lastError) {
          sendResponse({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
        } else {
          sendResponse(response);
        }
      }
    );
    return true; // 保持消息通道开放
  }
  
  // 记住最后保存的目录
  if (request.action === "saveLastDirectory") {
    chrome.storage.sync.set({ lastDirectory: request.directory }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  // 获取最后保存的目录
  if (request.action === "getLastDirectory") {
    chrome.storage.sync.get(['lastDirectory'], (result) => {
      sendResponse({ directory: result.lastDirectory || '' });
    });
    return true;
  }
});

// 添加错误恢复机制
function recreateContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'saveText',
      title: chrome.i18n.getMessage('contextMenuTitle'),
      contexts: ['selection']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('重新创建右键菜单失败:', chrome.runtime.lastError);
      }
    });
  });
}

// 修改更新函数
function updateContextMenu() {
  if (!isBrowserSupported()) {
    console.error('当前浏览器不支持所需API');
    return;
  }

  try {
    chrome.contextMenus.update('saveText', {
      title: chrome.i18n.getMessage('contextMenuTitle')
    }, (error) => {
      if (chrome.runtime.lastError) {
        console.error('更新右键菜单失败，尝试重新创建');
        recreateContextMenu();
      }
    });
  } catch (error) {
    console.error('更新右键菜单操作失败，尝试重新创建');
    recreateContextMenu();
  }
}

// 监听语言设置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.language) {
    const newLanguage = changes.language.newValue;
    console.log('语言设置变化:', newLanguage);
    
    // 立即更新右键菜单
    updateContextMenu();
    
    // 通知所有标签页
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, {
            action: 'updateLanguage',
            language: newLanguage
          }).catch(() => {});
        } catch (error) {}
      });
    });
  }
}); 
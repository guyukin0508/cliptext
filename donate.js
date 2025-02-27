document.addEventListener('DOMContentLoaded', () => {
  // 点击关闭窗口
  document.addEventListener('click', () => {
    window.close();
  });

  // ESC 关闭窗口
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.close();
    }
  });

  // 阻止点击容器时关闭
  document.querySelector('.donate-container').addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // 更新语言
  const browserLang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const translations = {
    zh: {
      donateTitle: '感谢支持',
      donateDesc: '如果这个扩展对您有帮助，欢迎赞赏支持~',
      wechatPay: '微信支付',
      aliPay: '支付宝',
      closeHint: '点击任意处关闭'
    },
    en: {
      donateTitle: 'Support Developer',
      donateDesc: 'If you find this extension helpful, feel free to buy me a coffee!',
      wechatPay: 'WeChat Pay',
      aliPay: 'AliPay',
      closeHint: 'Click anywhere to close'
    }
  };

  // 更新界面文本
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    element.textContent = translations[browserLang][key] || key;
  });
}); 
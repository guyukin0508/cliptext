const fs = require('fs').promises; // 使用 Promise 版本的 fs
const path = require('path');
const Terser = require('terser');
const CleanCSS = require('clean-css');

// 定义构建配置
const BUILD_CONFIG = {
  // 输出目录
  outputDir: 'build',
  
  // 源文件配置
  sourceFiles: {
    // 直接复制的静态资源
    static: {
      directories: ['icons', 'images'],
      files: ['manifest.json']
    },
    
    // HTML 文件 - 直接复制
    html: [
      'popup.html',      // 弹出窗口
      'privacy.html',    // 隐私政策
      'donate.html'      // 捐赠页面
    ],
    
    // CSS 文件 - 需要压缩
    css: [
      'content.css',     // 内容脚本样式
      'popup.css',       // 改为根目录
      'donate.css'       // 捐赠页面样式
    ],
    
    // JS 文件 - 需要压缩/混淆
    javascript: {
      // content.js 使用强混淆
      contentScript: ['content.js'],
      // 其他 JS 文件使用普通压缩
      normal: [
        'background.js',
        'popup.js',
        'donate.js'
      ]
    },
    
    locales: {
      // 语言文件 - 都是必需的
      directories: ['_locales'],
      files: [
        '_locales/en/messages.json',
        '_locales/zh/messages.json'
      ]
    }
  },
  
  // 修改必需文件列表 - 删除不存在的文件
  files: {
    required: [
      'manifest.json',
      'content.js',
      'background.js',
      'popup.html',
      'popup.js',
      'popup.css',      // 改为根目录
      'donate.html',
      'donate.css',
      'donate.js',
      '_locales/en/messages.json',
      '_locales/zh/messages.json',
      'icons/save_inspiration_16.png',
      'icons/save_inspiration_32.png',
      'icons/save_inspiration_48.png',
      'icons/save_inspiration_128.png'
    ],
    optional: [
      'privacy.html'
    ]
  }
};

// 工具函数
const utils = {
  // 确保目录存在
  async ensureDir(dir) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  },
  
  // 清理目录
  async cleanDir(dir) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(dir);
    } catch (error) {
      console.error(`清理目录失败: ${dir}`, error);
      throw error;
    }
  },
  
  // 复制文件
  async copyFile(src, dest) {
    try {
      await fs.copyFile(src, dest);
      console.log(`复制文件: ${src} -> ${dest}`);
    } catch (error) {
      console.error(`复制文件失败: ${src}`, error);
      throw error;
    }
  },
  
  // 复制目录
  async copyDir(src, dest) {
    try {
      await fs.cp(src, dest, { recursive: true });
      console.log(`复制目录: ${src} -> ${dest}`);
    } catch (error) {
      console.error(`复制目录失败: ${src}`, error);
      throw error;
    }
  },
  
  // 检查文件是否存在
  async fileExists(file) {
    try {
      await fs.access(file);
      return true;
    } catch {
      return false;
    }
  },

  // 添加新的工具函数来检查目录
  async ensureDirectoryExists(dirPath) {
    const dirname = path.dirname(dirPath);
    try {
      await fs.access(dirname);
    } catch {
      await fs.mkdir(dirname, { recursive: true });
    }
  },

  // 添加文件检查函数
  async checkFiles(files, required = true) {
    const missingFiles = [];
    for (const file of files) {
      if (!(await this.fileExists(file))) {
        if (required) {
          missingFiles.push(file);
        } else {
          console.warn(`警告: 可选文件不存在: ${file}`);
        }
      }
    }
    return missingFiles;
  }
};

// 构建任务
const buildTasks = {
  // 修改检查必需文件的函数
  async checkRequiredFiles() {
    console.log('检查文件...');
    
    // 检查必需文件
    const missingRequired = await utils.checkFiles(BUILD_CONFIG.files.required, true);
    if (missingRequired.length > 0) {
      throw new Error(`缺少必需文件:\n${missingRequired.join('\n')}`);
    }
    
    // 检查 CSS 文件
    console.log('\n检查 CSS 文件...');
    for (const file of BUILD_CONFIG.sourceFiles.css) {
      if (await utils.fileExists(file)) {
        console.log(`✓ 找到 CSS 文件: ${file}`);
      } else {
        throw new Error(`缺少 CSS 文件: ${file}`);
      }
    }
    
    // 检查可选文件
    await utils.checkFiles(BUILD_CONFIG.files.optional, false);
    
    console.log('✓ 文件检查完成');
  },
  
  // 添加专门处理语言文件的任务
  async processLocales() {
    console.log('\n处理语言文件...');
    
    // 确保目录存在
    const localesDir = path.join(BUILD_CONFIG.outputDir, '_locales');
    await utils.ensureDir(localesDir);
    await utils.ensureDir(path.join(localesDir, 'en'));
    await utils.ensureDir(path.join(localesDir, 'zh'));

    // 复制语言文件
    for (const file of BUILD_CONFIG.sourceFiles.locales.files) {
      const sourcePath = file;
      const targetPath = path.join(BUILD_CONFIG.outputDir, file);
      
      if (await utils.fileExists(sourcePath)) {
        await utils.copyFile(sourcePath, targetPath);
      } else {
        throw new Error(`缺少语言文件: ${sourcePath}`);
      }
    }
  },
  
  // 修改静态资源处理
  async processStatic() {
    console.log('\n处理静态资源...');
    
    // 复制静态目录
    for (const dir of BUILD_CONFIG.sourceFiles.static.directories) {
      const sourcePath = dir;
      const targetPath = path.join(BUILD_CONFIG.outputDir, dir);
      
      if (await utils.fileExists(sourcePath)) {
        await utils.ensureDir(targetPath);
        await utils.copyDir(sourcePath, targetPath);
      } else {
        throw new Error(`缺少静态资源目录: ${sourcePath}`);
      }
    }
    
    // 复制静态文件
    for (const file of BUILD_CONFIG.sourceFiles.static.files) {
      const sourcePath = file;
      const targetPath = path.join(BUILD_CONFIG.outputDir, file);
      
      if (await utils.fileExists(sourcePath)) {
        await utils.ensureDir(path.dirname(targetPath));
        await utils.copyFile(sourcePath, targetPath);
      } else {
        throw new Error(`缺少静态文件: ${sourcePath}`);
      }
    }
  },
  
  // 处理 HTML 文件
  async processHtml() {
    console.log('\n处理 HTML 文件...');
    
    for (const file of BUILD_CONFIG.sourceFiles.html) {
      if (await utils.fileExists(file)) {
        await utils.copyFile(
          file,
          path.join(BUILD_CONFIG.outputDir, file)
        );
      }
    }
  },
  
  // 处理 CSS 文件
  async processCss() {
    console.log('\n处理 CSS 文件...');
    const cleanCss = new CleanCSS();
    
    for (const file of BUILD_CONFIG.sourceFiles.css) {
      const sourcePath = file;
      const targetPath = path.join(BUILD_CONFIG.outputDir, file);
      
      try {
        if (await utils.fileExists(sourcePath)) {
          // 确保目标目录存在，包括子目录
          await utils.ensureDir(path.dirname(targetPath));
          
          // 读取和压缩 CSS
          const css = await fs.readFile(sourcePath, 'utf8');
          const minified = cleanCss.minify(css);
          
          if (minified.errors.length > 0) {
            throw new Error(`CSS 压缩错误 ${file}: ${minified.errors.join(', ')}`);
          }
          
          // 写入压缩后的 CSS
          await fs.writeFile(targetPath, minified.styles);
          console.log(`✓ 压缩 CSS: ${file}`);
        } else {
          throw new Error(`找不到 CSS 文件: ${sourcePath}`);
        }
      } catch (error) {
        console.error(`处理 CSS 文件失败: ${file}`, error);
        throw error;
      }
    }
    
    // 验证所有文件
    for (const file of BUILD_CONFIG.sourceFiles.css) {
      const targetPath = path.join(BUILD_CONFIG.outputDir, file);
      if (!(await utils.fileExists(targetPath))) {
        throw new Error(`CSS 文件丢失: ${file}`);
      }
    }
    
    console.log('✓ 所有 CSS 文件处理完成');
  },
  
  // 处理 JavaScript 文件
  async processJavaScript() {
    console.log('\n处理 JavaScript 文件...');
    
    // 处理 content.js (强混淆)
    for (const file of BUILD_CONFIG.sourceFiles.javascript.contentScript) {
      if (await utils.fileExists(file)) {
        const code = await fs.readFile(file, 'utf8');
        const result = await Terser.minify(code, {
          compress: {
            drop_console: false,
            dead_code: true,
            drop_debugger: true
          },
          mangle: {
            reserved: ['chrome', 'window', 'document']
          }
        });
        
        if (result.error) throw result.error;
        
        await fs.writeFile(
          path.join(BUILD_CONFIG.outputDir, file),
          result.code
        );
        console.log(`强混淆 JS: ${file}`);
      }
    }
    
    // 处理其他 JS 文件 (普通压缩)
    for (const file of BUILD_CONFIG.sourceFiles.javascript.normal) {
      if (await utils.fileExists(file)) {
        const code = await fs.readFile(file, 'utf8');
        const result = await Terser.minify(code, {
          compress: true,
          mangle: true
        });
        
        if (result.error) throw result.error;
        
        await fs.writeFile(
          path.join(BUILD_CONFIG.outputDir, file),
          result.code
        );
        console.log(`压缩 JS: ${file}`);
      }
    }
  }
};

// 修改主构建函数
async function build() {
  console.log('开始构建...\n');
  const startTime = Date.now();
  
  try {
    // 检查必需文件
    await buildTasks.checkRequiredFiles();
    
    // 清理并创建构建目录
    await utils.cleanDir(BUILD_CONFIG.outputDir);
    console.log(`✓ 创建构建目录: ${BUILD_CONFIG.outputDir}`);
    
    // 执行构建任务
    await buildTasks.processLocales();  // 先处理语言文件
    await buildTasks.processStatic();
    await buildTasks.processHtml();
    await buildTasks.processCss();
    await buildTasks.processJavaScript();
    
    const buildTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✨ 构建完成! 用时: ${buildTime}s`);
    
  } catch (error) {
    console.error('\n❌ 构建失败:', error);
    process.exit(1);
  }
}

// 执行构建
build().catch(error => {
  console.error('\n❌ 构建过程出现未捕获的错误:', error);
  process.exit(1);
}); 
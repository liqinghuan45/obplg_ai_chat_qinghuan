const { Plugin, ItemView, Notice, Setting, PluginSettingTab, setIcon, MarkdownRenderer, Modal, TFile, TFolder } = require('obsidian');

// 自定义视图类型常量
const CHAT_VIEW_TYPE = 'chat-ai-view';

// 默认设置
const DEFAULT_SETTINGS = {
    apiKey: [],
    baseUrl: [],
    model: [],
    currentApiKey: '',
    currentBaseUrl: 'https://yunwu.ai',
    currentModel: 'gpt-4',
    chatHistory: [], // 用于存储对话历史
    currentHistoryFile: '', // 当前对话历史文件路径
    tempHistoryFile: '', // 添加临时文件路径
    autoClearOnRestart: false, // 新增选项：是否自动清空记录
    autoFocus: true, // 添加自动聚焦设置,默认开启
    focusMode: false, // 新增专注模式开关
    fontSize: 14, // 添加默认字体大小设置
    historyPath: '', // 添加历史记录路径设置，默认为空
    temperature: 0.7, // 添加默认温度值
    useProxy: false, // 添加代理开关设置
    proxyUrl: '', // 代理地址设置，在插件设置中填写
    systemMessagePath: 'A重要文件/system_message', // 添加system message文件夹路径
    currentSystemMessage: '', // 当前使用的system message内容
    currentSystemMessageFile: '', // 当前选择的system message文件名
    customConfigs: [], // 添加自定义配置列表
    currentCustomConfig: '', // 当前使用的自定义配置名称
    starredHistoryFiles: [], // 添加星标历史记录文件列表
    showHistoryPanel: false, // 添加历史面板显示状态选项，默认隐藏
    clickConfigAutoNew: false, // 点击配置时自动新建对话并聚焦到输入框
    useStreaming: true, // 添加流式模式开关，默认开启
    compactConfigView: false, // 添加紧凑配置视图选项
    maxRetryAttempts: 3, // 最大自动重试次数
    maxTokens: 10000, // 添加最大补全长度设置，默认10000
    autoScrollAfterHistorySwitch: true, // 切换历史记录后自动滚动到底部，默认开启
    showScrollButtons: true,
    logRequestParams: false // 添加请求参数日志开关，默认关闭
}

// 在 DEFAULT_SETTINGS 后添加预设配置
const PRESET_OPTIONS = {
    apiKeys: [
        { label: '默认API密钥', value: '' },
        { label: 'OpenAI官方', value: 'sk-...' },
        { label: 'YunWu.AI', value: 'yw-...' }
    ],
    baseUrls: [
        { label: 'YunWu.AI', value: 'https://yunwu.ai' },
        { label: 'OpenAI官方', value: 'https://api.openai.com' }
    ],
    models: [
        { label: 'GPT-4', value: 'gpt-4' },
        { label: 'GPT-3.5', value: 'gpt-3.5-turbo' },
        { label: 'Claude-3', value: 'claude-3-opus-20240229' }
    ]
};

function parseKeyEntry(input = '') {
    const trimmed = (input || '').trim();
    if (!trimmed) {
        return { note: '', key: '' };
    }

    const separators = ['|', ',', '，', '：', ':'];
    for (const sep of separators) {
        const idx = trimmed.lastIndexOf(sep);
        if (idx > -1) {
            const note = trimmed.slice(0, idx).trim();
            const key = trimmed.slice(idx + sep.length).trim();
            if (key) {
                return { note, key };
            }
        }
    }

    const whitespaceMatch = trimmed.match(/^(.*\S)\s+(\S+)$/);
    if (whitespaceMatch) {
        return {
            note: whitespaceMatch[1].trim(),
            key: whitespaceMatch[2].trim()
        };
    }

    return { note: '', key: trimmed };
}

function getKeyValueFromEntry(entry = '') {
    const { key } = parseKeyEntry(entry);
    return key || (entry ? entry.trim() : '');
}

// 添加 TextEditModal 类
class TextEditModal extends Modal {
    constructor(app, title, initialValue, onSubmit) {
        super(app);
        this.title = title;
        this.initialValue = initialValue;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: this.title });

        // 创建文本区域
        this.textArea = contentEl.createEl('textarea', {
            cls: 'text-edit-modal-textarea',
            attr: {
                rows: '10',
                style: 'width: 100%; font-family: monospace; resize: vertical;'
            }
        });
        this.textArea.value = this.initialValue;

        // 创建按钮容器
        const buttonContainer = contentEl.createDiv({
            cls: 'text-edit-modal-buttons',
            attr: {
                style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;'
            }
        });

        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.addEventListener('click', () => this.close());

        // 保存按钮
        const submitButton = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: '保存'
        });
        submitButton.addEventListener('click', () => {
            this.onSubmit(this.textArea.value);
            this.close();
        });

        // 添加 Ctrl+Enter 快捷键监听
        this.textArea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault(); // 阻止默认的回车行为（如换行）
                this.onSubmit(this.textArea.value);
                this.close();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 在 TextEditModal 类后添加新的设置弹窗类
class SettingsModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // 添加标题
        contentEl.createEl('h2', { 
            text: '对话AI 设置',
            attr: {
                style: 'margin-bottom: 0.5em;' // 减小底部边距
            }
        });
        
        // 添加链接
        const link = contentEl.createEl('a', {
            text: '全网超低价中转api，点击这里获取',
            attr: {
                href: 'https://yunwu.ai/register?aff=zah7',
                style: 'color: var(--text-accent); font-size: 0.9em; text-decoration: none; display: block; margin-bottom: 1.5em;'
            }
        });
        
        // 添加悬停效果
        link.addEventListener('mouseover', () => {
            link.style.textDecoration = 'underline';
        });
        
        link.addEventListener('mouseout', () => {
            link.style.textDecoration = 'none';
        });
        
        // 处理点击事件，在默认浏览器中打开链接
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.open('https://yunwu.ai/register?aff=zah7', '_blank');
        });

        // API Key 设置
        new Setting(contentEl)
            .setName('API 密钥')
            .setDesc('选择或编辑你的 API 密钥列表')
            .addDropdown(dropdown => {
                // 确保 apiKey 是数组
                if (!Array.isArray(this.plugin.settings.apiKey)) {
                    this.plugin.settings.apiKey = this.plugin.settings.apiKey.split('\n').filter(line => line.trim());
                }
                // 添加选项到下拉菜单
                this.plugin.settings.apiKey.forEach(line => {
                    const { note, key } = parseKeyEntry(line);
                    const trimmedLine = line.trim();
                    const displayText = note
                        ? note
                        : (key ? `${key.substring(0, 10)}...` : trimmedLine);
                    dropdown.addOption(trimmedLine, displayText);
                });
                // 设置当前选中值
                if (this.plugin.settings.apiKey.length > 0) {
                    dropdown.setValue(this.plugin.settings.currentApiKey || this.plugin.settings.apiKey[0]);
                }
                // 处理选择变更
                dropdown.onChange(async (value) => {
                    this.plugin.settings.currentApiKey = value;
                    await this.plugin.saveSettings();
                });
            })
            .addButton(button => button
                .setButtonText('编辑列表')
                .onClick(() => {
                    const modal = new ParameterEditModal(
                        this.app,
                        '编辑 API 密钥列表',
                        Array.isArray(this.plugin.settings.apiKey)
                            ? this.plugin.settings.apiKey.join('\n')
                            : this.plugin.settings.apiKey,
                        async (result) => {
                            const apiKeys = result.split('\n').filter(line => line.trim());
                            this.plugin.settings.apiKey = apiKeys;
                            this.plugin.settings.currentApiKey = apiKeys.length > 0 ? apiKeys[0] : '';
                            await this.plugin.saveSettings();
                            this.onOpen(); // 重新加载设置界面
                        },
                        'key'
                    );
                    modal.open();
                }));

        // Base URL 设置
        new Setting(contentEl)
            .setName('Base URL')
            .setDesc('选择或编辑API基础地址列表')
            .addDropdown(dropdown => {
                if (!Array.isArray(this.plugin.settings.baseUrl)) {
                    this.plugin.settings.baseUrl = [this.plugin.settings.baseUrl];
                }
                this.plugin.settings.baseUrl.forEach(url => {
                    const urlMatch = url.match(/(.*?)(https?:\/\/\S+)/);
                    if (urlMatch) {
                        const [_, note, baseUrl] = urlMatch;
                        const displayText = note.trim()
                            ? note.trim()  // 只显示备注部分
                            : baseUrl;
                        dropdown.addOption(url.trim(), displayText);
                    } else {
                        dropdown.addOption(url.trim(), url.trim());
                    }
                });
                dropdown.setValue(this.plugin.settings.currentBaseUrl)
                dropdown.onChange(async (value) => {
                    this.plugin.settings.currentBaseUrl = value;
                    await this.plugin.saveSettings();
                });
            })
            .addButton(button => button
                .setButtonText('编辑列表')
                .onClick(() => {
                    const modal = new ParameterEditModal(
                        this.app,
                        '编辑基础地址列表',
                        Array.isArray(this.plugin.settings.baseUrl)
                            ? this.plugin.settings.baseUrl.join('\n')
                            : this.plugin.settings.baseUrl,
                        async (result) => {
                            const urls = result.split('\n').filter(line => line.trim());
                            this.plugin.settings.baseUrl = urls;
                            this.plugin.settings.currentBaseUrl = urls.length > 0 ? urls[0] : '';
                            await this.plugin.saveSettings();
                            this.onOpen();
                        },
                        'vendor'
                    );
                    modal.open();
                }));

        // 模型名称设置
        new Setting(contentEl)
            .setName('模型名称')
            .setDesc('选择或编辑模型名称列表')
            .addDropdown(dropdown => {
                if (!Array.isArray(this.plugin.settings.model)) {
                    this.plugin.settings.model = [this.plugin.settings.model];
                }
                this.plugin.settings.model.forEach(model => {
                    dropdown.addOption(model.trim(), model.trim());
                });
                dropdown.setValue(this.plugin.settings.currentModel)
                dropdown.onChange(async (value) => {
                    this.plugin.settings.currentModel = value;
                    await this.plugin.saveSettings();
                });
            })
            .addButton(button => button
                .setButtonText('编辑列表')
                .onClick(() => {
                    const modal = new ParameterEditModal(
                        this.app,
                        '编辑模型名称列表',
                        Array.isArray(this.plugin.settings.model)
                            ? this.plugin.settings.model.join('\n')
                            : this.plugin.settings.model,
                        async (result) => {
                            const models = result.split('\n').filter(line => line.trim());
                            this.plugin.settings.model = models;
                            this.plugin.settings.currentModel = models.length > 0 ? models[0] : '';
                            await this.plugin.saveSettings();
                            this.onOpen();
                        },
                        'model'
                    );
                    modal.open();
                }));

        // 添加自定义配置模块
        new Setting(contentEl)
            .setName('自定义配置')
            .setDesc('创建和管理自定义配置')
            .addButton(button => button
                .setButtonText('添加配置')
                .onClick(() => {
                    const modal = new ConfigEditModal(this.app, this);
                    modal.open();
                }));

        // 显示自定义配置列表
        const configSectionContainer = contentEl.createDiv({
            cls: 'custom-configs-section',
            attr: {
                style: 'margin-top: 1em; border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 10px;'
            }
        });
        
        // 添加标题
        configSectionContainer.createEl('h3', { 
            text: '配置列表',
            attr: {
                style: 'margin-top: 0; margin-bottom: 10px; font-size: 1em;'
            }
        });
        
        // 自定义配置列表
        if (Array.isArray(this.plugin.settings.customConfigs) && this.plugin.settings.customConfigs.length > 0) {
            const configListContainer = configSectionContainer.createDiv({
                cls: 'custom-configs-list',
                attr: {
                    style: 'max-height: 360px; overflow-y: auto;' // 新增：限制高度并启用滚动
                }
            });
            
            this.plugin.settings.customConfigs.forEach(config => {
                const configItem = configListContainer.createDiv({
                    cls: 'custom-config-item',
                    attr: {
                        style: 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 8px; border-radius: 4px; background: var(--background-primary-alt);'
                    }
                });
                
                // 配置信息区域
                const configInfo = configItem.createDiv({
                    cls: 'custom-config-info',
                    attr: {
                        style: 'flex-grow: 1;'
                    }
                });
                
                configInfo.createEl('span', { 
                    text: config.name,
                    attr: {
                        style: 'font-weight: bold;'
                    }
                });
                
                const configDetails = configInfo.createEl('div', {
                    cls: 'custom-config-details',
                    attr: {
                        style: 'font-size: 0.85em; color: var(--text-muted); margin-top: 4px;'
                    }
                });
                
                configDetails.createEl('div', { 
                    text: `API: ${config.apiKey.substring(0, 15)}...`
                });
                
                configDetails.createEl('div', { 
                    text: `URL: ${config.baseUrl}`
                });
                
                configDetails.createEl('div', { 
                    text: `模型: ${config.model}`
                });
                
                configDetails.createEl('div', { 
                    text: `代理: ${config.useProxy ? '开启' : '关闭'}`
                });
                
                // 配置操作按钮容器
                const configActions = configItem.createDiv({
                    cls: 'custom-config-actions',
                    attr: {
                        style: 'display: flex; gap: 4px;'
                    }
                });
                
                // 应用按钮
                const applyButton = configActions.createEl('button', {
                    text: '应用',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                applyButton.addEventListener('click', async () => {
                    this.plugin.settings.currentApiKey = config.apiKey;
                    this.plugin.settings.currentBaseUrl = config.baseUrl;
                    this.plugin.settings.currentModel = config.model;
                    this.plugin.settings.useProxy = config.useProxy;
                    this.plugin.settings.proxyUrl = config.proxyUrl;
                    this.plugin.settings.currentCustomConfig = config.name;
                    
                    // 更新system message设置
                    if (config.currentSystemMessageFile) {
                        this.plugin.settings.currentSystemMessageFile = config.currentSystemMessageFile;
                        this.plugin.settings.currentSystemMessage = config.currentSystemMessage || '';
                        
                        // 更新系统消息下拉菜单
                        if (this.rightPanel) {
                            const systemMessageSelect = this.rightPanel.querySelector('.chat-ai-dropdown:nth-child(4)');
                            if (systemMessageSelect) {
                                Array.from(systemMessageSelect.options).forEach(option => {
                                    option.selected = option.value === config.currentSystemMessageFile;
                                });
                            }
                        }
                    } else {
                        // 如果配置没有系统消息文件，则将系统消息设置为空
                        this.plugin.settings.currentSystemMessageFile = '';
                        this.plugin.settings.currentSystemMessage = '';

                        // 更新系统消息下拉菜单
                        if (this.rightPanel) {
                            const systemMessageSelect = this.rightPanel.querySelector('.chat-ai-dropdown:nth-child(4)');
                            if (systemMessageSelect) {
                                Array.from(systemMessageSelect.options).forEach(option => {
                                    option.selected = option.value === '';
                                });
                            }
                        }
                    }
                    
                    // 保存设置
                    await this.plugin.saveSettings();
                    
                    // 更新下拉菜单选项
                    await this.updateDropdowns();
                    
                    // 刷新配置按钮
                    this.renderConfigButtons();
                    
                    // 显示通知
                    // new Notice(`已应用配置：${config.name}`);
                });
                
                // 编辑按钮
                const editButton = configActions.createEl('button', {
                    text: '编辑',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--interactive-normal); border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                editButton.addEventListener('click', () => {
                    const modal = new ConfigEditModal(this.app, this.plugin, config);
                    modal.open();
                });
                
                // 删除按钮
                const deleteButton = configActions.createEl('button', {
                    text: '删除',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--background-modifier-error); color: white; border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                deleteButton.addEventListener('click', async () => {
                    // 先从DOM中移除当前配置项，实现视觉上的立即反馈
                    configItem.remove();
                    
                    // 从设置中移除该配置
                    this.plugin.settings.customConfigs = this.plugin.settings.customConfigs.filter(c => c.name !== config.name);
                    
                    // 如果删除的是当前选中的配置，重置当前配置
                    if (this.plugin.settings.currentCustomConfig === config.name) {
                        this.plugin.settings.currentCustomConfig = '';
                    }
                    
                    // 保存设置
                    await this.plugin.saveSettings();
                    
                    // 如果删除后没有预设了，显示提示文本
                    if (this.plugin.settings.customConfigs.length === 0) {
                        const configListContainer = configSectionContainer.querySelector('.custom-configs-list');
                        if (configListContainer) configListContainer.remove();
                        
                        configSectionContainer.createEl('p', {
                            text: '尚未创建自定义配置。点击"添加配置"按钮创建一个新配置。',
                            attr: {
                                style: 'color: var(--text-muted); font-style: italic; margin-top: 8px;'
                            }
                        });
                    }
                    
                    // 更新所有打开的ChatView视图
                    this.plugin.updateAllChatViews();
                    
                    new Notice(`配置 "${config.name}" 已删除`);
                });
            });
        } else {
            configSectionContainer.createEl('p', {
                text: '尚未创建自定义配置。点击"添加配置"按钮创建一个新配置。',
                attr: {
                    style: 'color: var(--text-muted); font-style: italic; margin-top: 8px;'
                }
            });
        }

        // 新增：自动清空记录选项
        new Setting(contentEl)
            .setName('自动清空记录')
            .setDesc('如果开启，每次重启面板都会把之前的对话记录保存为一个历史记录，并清空对话窗口。')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.autoClearOnRestart)
                    .onChange(async (value) => {
                        this.plugin.settings.autoClearOnRestart = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 添加自动聚焦设置
        new Setting(contentEl)
            .setName('自动聚焦')
            .setDesc('打开面板时自动聚焦到输入框')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.autoFocus)
                    .onChange(async (value) => {
                        this.plugin.settings.autoFocus = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 新增专注模式开关
        new Setting(contentEl)
            .setName('专注模式')
            .setDesc('打开后，面板上方按钮和选择参数行只有在鼠标悬浮时才会显示。')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.focusMode)
                    .onChange(async (value) => {
                        this.plugin.settings.focusMode = value;
                        await this.plugin.saveSettings();
                        // 更新所有打开的聊天视图的专注模式
                        this.plugin.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
                            if (leaf.view instanceof ChatView) {
                                leaf.view.updateFocusMode();
                            }
                        });
                    });
            });

        // 添加历史记录路径设置
        new Setting(contentEl)
            .setName('历史记录路径')
            .setDesc('设置对话历史记录的存放路径（例如：AI/历史记录）')
            .addText(text => {
                text.setPlaceholder('输入历史记录存放路径')
                    .setValue(this.plugin.settings.historyPath)
                    .onChange(async (value) => {
                        // 移除开头的斜杠
                        value = value.replace(/^\/+/, '');
                        // 移除结尾的斜杠
                        value = value.replace(/\/+$/, '');
                        
                        this.plugin.settings.historyPath = value;
                        // 更新临时文件路径
                        this.plugin.settings.tempHistoryFile = value ? `${value}/临时对话.md` : '';
                        await this.plugin.saveSettings();
                        
                        // 确保文件夹存在
                        if (value) {
                            try {
                                const folder = this.plugin.app.vault.getAbstractFileByPath(value);
                                if (!(folder instanceof TFolder)) {
                                    await this.plugin.app.vault.createFolder(value);
                                }
                            } catch (error) {
                                console.error('创建历史记录文件夹失败:', error);
                                new Notice('创建历史记录文件夹失败，请检查路径是否合法');
                            }
                        }
                    });
            })
            .addExtraButton(button => {
                button
                    .setIcon('folder')
                    .setTooltip('选择文件夹')
                    .onClick(async () => {
                        // 创建文件夹选择模态框
                        new FolderSuggestModal(this.app, async (folder) => {
                            const path = folder.path;
                            this.plugin.settings.historyPath = path;
                            this.plugin.settings.tempHistoryFile = `${path}/临时对话.md`;
                            await this.plugin.saveSettings();
                            this.onOpen(); // 使用 onOpen 替代 display
                        }).open();
                    });
            });

        // 添加温度滑块设置
        new Setting(contentEl)
            .setName('模型温度')
            .setDesc('控制AI回复的随机性(0-2)。较低的值会使回复更加确定,较高的值会使回复更加随机和创造性。')
            .addSlider(slider => slider
                .setLimits(0, 2, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.temperature = value;
                    await this.plugin.saveSettings();
                }));

        // 添加 System Message 文件夹路径设置
        new Setting(contentEl)
            .setName('System Message 文件夹路径')
            .setDesc('设置存放System Message文件的文件夹路径')
            .addText(text => text
                .setPlaceholder('例如: A重要文件/system_message')
                .setValue(this.plugin.settings.systemMessagePath)
                .onChange(async (value) => {
                    // 移除末尾的斜杠
                    value = value.replace(/\/+$/, '');
                    
                    this.plugin.settings.systemMessagePath = value;
                    await this.plugin.saveSettings();
                    
                    // 确保文件夹存在
                    if (value) {
                        try {
                            const folder = this.plugin.app.vault.getAbstractFileByPath(value);
                            if (!(folder instanceof TFolder)) {
                                await this.plugin.app.vault.createFolder(value);
                            }
                        } catch (error) {
                            console.error('创建System Message文件夹失败:', error);
                            new Notice('创建System Message文件夹失败，请检查路径是否合法');
                        }
                    }
                }))
            .addExtraButton(button => {
                button
                    .setIcon('folder')
                    .setTooltip('选择文件夹')
                    .onClick(async () => {
                        // 创建文件夹选择模态框
                        new FolderSuggestModal(this.app, async (folder) => {
                            const path = folder.path;
                            this.plugin.settings.systemMessagePath = path;
                            await this.plugin.saveSettings();
                            this.onOpen();
                        }).open();
                    });
            });

        // 添加 System Message 设置
        new Setting(contentEl)
            .setName('System Message')
            .setDesc('从文件夹中选择System Message文件，或创建新的System Message')
            .addDropdown(async dropdown => {
                // 添加空选项
                dropdown.addOption('', '选择System Message');
                
                // 确保文件夹存在
                let folder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.systemMessagePath);
                if (!(folder instanceof TFolder)) {
                    try {
                        folder = await this.plugin.app.vault.createFolder(this.plugin.settings.systemMessagePath);
                    } catch (error) {
                        console.error('创建system message文件夹失败:', error);
                        return;
                    }
                }

                // 获取所有md文件
                const files = this.plugin.app.vault.getFiles()
                    .filter(file => 
                        file.path.startsWith(this.plugin.settings.systemMessagePath) && 
                        file.extension === 'md'
                    );

                // 添加文件选项
                files.forEach(file => {
                    dropdown.addOption(file.basename + '.md', file.basename);
                });

                // 设置当前值
                dropdown.setValue(this.plugin.settings.currentSystemMessageFile);

                // 添加变更事件
                dropdown.onChange(async (value) => {
                    this.plugin.settings.currentSystemMessageFile = value;
                    if (value) {
                        const filePath = `${this.plugin.settings.systemMessagePath}/${value}`;
                        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                        if (file instanceof TFile) {
                            const content = await this.plugin.app.vault.read(file);
                            this.plugin.settings.currentSystemMessage = content;
                        }
                    } else {
                        this.plugin.settings.currentSystemMessage = '';
                    }
                    await this.plugin.saveSettings();
                });
            })
            .addButton(button => button
                .setButtonText('新建角色')
                .onClick(async () => {
                    // 创建新的双输入框模态框
                    const modal = new SystemMessageCreateModal(
                        this.app,
                        async (title, content) => {
                            if (!title.trim() || !content.trim()) return;
                            
                            // 处理文件名，确保以 .md 结尾
                            const filename = title.trim().endsWith('.md') ? title.trim() : `${title.trim()}.md`;
                            const filePath = `${this.plugin.settings.systemMessagePath}/${filename}`;
                            
                            // 创建文件
                            await this.plugin.app.vault.create(filePath, content);
                            
                            // 更新设置
                            this.plugin.settings.currentSystemMessageFile = filename;
                            this.plugin.settings.currentSystemMessage = content;
                            await this.plugin.saveSettings();
                            
                            // 刷新设置界面
                            this.onOpen();
                        }
                    );
                    modal.open();
                }));

        // 在 onOpen() 方法中，在添加其他设置后添加导入导出按钮
        new Setting(contentEl)
            .setName('导入导出设置')
            .setDesc('导出设置到剪贴板或从剪贴板导入设置（包含System Message文件）')
            .addButton(button => button
                .setButtonText('导出')
                .onClick(async () => {
                    const exportSettings = {
                        apiKey: this.plugin.settings.apiKey,
                        baseUrl: this.plugin.settings.baseUrl,
                        model: this.plugin.settings.model,
                        currentApiKey: this.plugin.settings.currentApiKey,
                        currentBaseUrl: this.plugin.settings.currentBaseUrl,
                        currentModel: this.plugin.settings.currentModel,
                        temperature: this.plugin.settings.temperature,
                        useProxy: this.plugin.settings.useProxy,
                        proxyUrl: this.plugin.settings.proxyUrl,
                        systemMessagePath: this.plugin.settings.systemMessagePath,
                        currentSystemMessage: this.plugin.settings.currentSystemMessage,
                        currentSystemMessageFile: this.plugin.settings.currentSystemMessageFile,
                        customConfigs: this.plugin.settings.customConfigs || [], // 添加自定义配置
                        currentCustomConfig: this.plugin.settings.currentCustomConfig || '', // 添加当前使用的自定义配置名称
                        systemMessageFiles: {} // 添加System Message文件内容
                    };
                    
                    // 导出System Message目录下的所有文件
                    try {
                        const systemMessagePath = this.plugin.settings.systemMessagePath;
                        if (systemMessagePath) {
                            const folder = this.plugin.app.vault.getAbstractFileByPath(systemMessagePath);
                            if (folder instanceof TFolder) {
                                const files = this.plugin.app.vault.getFiles()
                                    .filter(file => 
                                        file.path.startsWith(systemMessagePath) && 
                                        file.extension === 'md'
                                    );
                                
                                for (const file of files) {
                                    const content = await this.plugin.app.vault.read(file);
                                    exportSettings.systemMessageFiles[file.name] = content;
                                }
                                
                                new Notice(`已导出 ${files.length} 个System Message文件`);
                            }
                        }
                    } catch (error) {
                        console.error('导出System Message文件失败:', error);
                        new Notice('导出System Message文件时出现错误，但其他设置已导出');
                    }
                    
                    await navigator.clipboard.writeText(JSON.stringify(exportSettings, null, 2));
                    new Notice('设置已复制到剪贴板');
                }))
            .addButton(button => button
                .setButtonText('导入')
                .onClick(async () => {
                    try {
                        const text = await navigator.clipboard.readText();
                        const importedSettings = JSON.parse(text);
                        
                        // 验证导入的设置格式
                        const requiredKeys = ['apiKey', 'baseUrl', 'model'];
                        const missingKeys = requiredKeys.filter(key => !importedSettings.hasOwnProperty(key));
                        
                        if (missingKeys.length > 0) {
                            new Notice(`导入失败: 缺少必要的设置项 ${missingKeys.join(', ')}`);
                            return;
                        }
                        
                        // 处理System Message文件导入
                        const importSystemMessageFiles = async (overrideMode = false) => {
                            let systemMessageCount = 0;
                            let skippedCount = 0;
                            if (importedSettings.systemMessageFiles && typeof importedSettings.systemMessageFiles === 'object') {
                                try {
                                    // 确保System Message目录存在
                                    const systemMessagePath = importedSettings.systemMessagePath || this.plugin.settings.systemMessagePath;
                                    if (systemMessagePath) {
                                        let folder = this.plugin.app.vault.getAbstractFileByPath(systemMessagePath);
                                        if (!(folder instanceof TFolder)) {
                                            await this.plugin.app.vault.createFolder(systemMessagePath);
                                        }
                                        
                                        // 导入每个System Message文件
                                        for (const [fileName, content] of Object.entries(importedSettings.systemMessageFiles)) {
                                            const filePath = `${systemMessagePath}/${fileName}`;
                                            const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
                                            
                                            if (existingFile instanceof TFile) {
                                                if (overrideMode) {
                                                    // 覆盖模式：直接覆盖文件内容
                                                    await this.plugin.app.vault.modify(existingFile, content);
                                                    systemMessageCount++;
                                                } else {
                                                    // 追加模式：跳过已存在的文件
                                                    continue;
                                                }
                                            } else {
                                                // 创建新文件
                                                await this.plugin.app.vault.create(filePath, content);
                                                systemMessageCount++;
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.error('导入System Message文件失败:', error);
                                    new Notice('导入System Message文件时出现错误');
                                }
                            }
                            return systemMessageCount;
                        };

                        // 打开选择模式对话框
                        new ImportModeModal(this.app, async (mode) => {
                            if (mode === 'override') {
                                // 覆盖模式：直接替换所有设置
                                Object.assign(this.plugin.settings, importedSettings);
                                await this.plugin.saveSettings();
                                
                                // 导入System Message文件（覆盖模式）
                                const systemMessageCount = await importSystemMessageFiles(true);
                                
                                this.onOpen(); // 刷新设置界面
                                new Notice(`设置已完全覆盖导入${systemMessageCount > 0 ? `，导入了 ${systemMessageCount} 个System Message文件` : ''}`);
                            } else {
                                // 追加模式：只添加新的设置项
                                const changes = [];
                                
                                // 处理数组类型的设置
                                ['apiKey', 'baseUrl', 'model'].forEach(key => {
                                    const currentSet = new Set(this.plugin.settings[key]);
                                    const newItems = importedSettings[key].filter(item => !currentSet.has(item));
                                    
                                    if (newItems.length > 0) {
                                        this.plugin.settings[key].push(...newItems);
                                        changes.push(`${key}: +${newItems.length}项`);
                                    }
                                });
                                
                                // 处理自定义配置的导入
                                if (importedSettings.customConfigs && Array.isArray(importedSettings.customConfigs)) {
                                    // 确保自定义配置数组已初始化
                                    if (!Array.isArray(this.plugin.settings.customConfigs)) {
                                        this.plugin.settings.customConfigs = [];
                                    }
                                    
                                    // 记录现有的配置名称
                                    const existingConfigNames = new Set(
                                        this.plugin.settings.customConfigs.map(config => config.name)
                                    );
                                    
                                    // 只导入不存在的配置
                                    const newConfigs = importedSettings.customConfigs.filter(
                                        config => !existingConfigNames.has(config.name)
                                    );
                                    
                                    if (newConfigs.length > 0) {
                                        this.plugin.settings.customConfigs.push(...newConfigs);
                                        changes.push(`自定义配置: +${newConfigs.length}项`);
                                    }
                                }
                                
                                // 导入System Message文件（追加模式，只导入新文件）
                                const systemMessageCount = await importSystemMessageFiles(false);
                                if (systemMessageCount > 0) {
                                    changes.push(`System Message文件: +${systemMessageCount}项`);
                                }
                                
                                await this.plugin.saveSettings();
                                this.onOpen(); // 刷新设置界面
                                
                                if (changes.length > 0) {
                                    new Notice(`追加导入成功:\n${changes.join('\n')}`);
                                } else {
                                    new Notice('没有新的设置需要导入');
                                }
                            }
                        }).open();
                        
                    } catch (error) {
                        new Notice('导入失败: 剪贴板内容格式不正确');
                        console.error('导入设置失败:', error);
                    }
                }));

        // 在 SettingsModal 类的 onOpen 方法中，在代理开关设置后添加
        new Setting(contentEl)
            .setName('代理服务器地址')
            .setDesc('设置代理服务器的地址')
            .addText(text => text
                .setPlaceholder('http://example.com/proxy')
                .setValue(this.plugin.settings.proxyUrl)
                .onChange(async (value) => {
                    this.plugin.settings.proxyUrl = value;
                    await this.plugin.saveSettings();
                }));

        // 添加点击配置时自动新建对话选项
        new Setting(contentEl)
            .setName('点击配置时自动新建对话')
            .setDesc('点击配置元素时自动执行新建对话操作并聚焦到输入框')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.clickConfigAutoNew)
                    .onChange(async (value) => {
                        this.plugin.settings.clickConfigAutoNew = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 添加紧凑配置视图选项
        new Setting(contentEl)
            .setName('紧凑配置视图')
            .setDesc('在主面板中只显示一行配置，悬停时展开全部')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.compactConfigView)
                    .onChange(async (value) => {
                        this.plugin.settings.compactConfigView = value;
                        await this.plugin.saveSettings();
                        // 更新所有聊天视图以应用紧凑模式
                        this.plugin.updateAllChatViews();
                    });
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 添加文件夹选择模态框类
class FolderSuggestModal extends Modal {
    constructor(app, onChoose) {
        super(app);
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: '选择历史记录存放文件夹' });
        
        const folderList = contentEl.createDiv({
            cls: 'folder-list',
            attr: {
                style: 'max-height: 400px; overflow-y: auto; margin-top: 10px;'
            }
        });

        // 获取所有文件夹
        const folders = this.getAllFolders();
        
        folders.forEach(folder => {
            const folderItem = folderList.createDiv({
                cls: 'folder-item',
                attr: {
                    style: 'padding: 8px; cursor: pointer; border-radius: 4px; margin-bottom: 4px;'
                }
            });
            
            // 添加缩进效果
            const indent = '&nbsp;'.repeat(folder.depth * 4);
            folderItem.innerHTML = `${indent}📁 ${folder.name}`;
            
            // 添加悬停效果
            folderItem.addEventListener('mouseover', () => {
                folderItem.style.backgroundColor = 'var(--background-modifier-hover)';
            });
            
            folderItem.addEventListener('mouseout', () => {
                folderItem.style.backgroundColor = '';
            });
            
            // 点击选择文件夹
            folderItem.addEventListener('click', () => {
                this.onChoose(folder.folder); // 确保调用了 onChoose 回调
                this.close();
            });
        });
    }

    getAllFolders(root = this.app.vault.getRoot(), depth = 0) {
        let folders = [];
        
        if (root instanceof TFolder) {
            folders.push({
                folder: root,
                name: root.name,
                depth: depth
            });
            
            root.children.forEach(child => {
                if (child instanceof TFolder) {
                    folders = folders.concat(this.getAllFolders(child, depth + 1));
                }
            });
        }
        
        return folders;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 定义聊天视图类
class ChatView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.messages = [];
        this.handleWheel = this.handleWheel.bind(this);
        this.autoScroll = true; // 添加自动滚动标志位
        this.isReceivingResponse = false; // 添加AI回复状态标志
    }

    getViewType() {
        return CHAT_VIEW_TYPE;
    }

    getDisplayText() {
        return "清欢的ai"; 
    }

    getIcon() {
        return 'message-square'; // 使用 Obsidian 内置的 message-square 图标
    }

    async onOpen() {
        this.messages = [...this.plugin.settings.chatHistory];
        
        // 创建主容器
        this.contentEl.empty();
        this.contentEl.addClass('chat-ai-view-container');
        
        // 添加CSS
        this.addStyle();
        
        // 注册主题观察器
        this.registerThemeObserver();
        
        // 注册历史记录文件监听器
        this.registerHistoryFileWatcher();
        
        console.log('ChatView onOpen 开始执行');
        console.log('当前自动清空设置:', this.plugin.settings.autoClearOnRestart);
        console.log('当前消息数量:', this.messages.length);
        
        this.containerEl.empty();
        this.containerEl.addClass('workspace-leaf-content');
        this.containerEl.setAttribute('data-type', CHAT_VIEW_TYPE);

        // 在创建UI元素之前处理自动清空
        if (this.plugin.settings.autoClearOnRestart) {
            // 检查是否有临时文件
            const tempFile = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.tempHistoryFile);
            if (tempFile instanceof TFile) {
                try {
                    // 读取临时文件内容
                    const content = await this.plugin.app.vault.read(tempFile);
                    const chatHistory = this.plugin.parseMarkdownToChatHistory(content);
                    if (chatHistory.length > 0) {
                        // 保存为历史记录
                        await this.plugin.saveChatHistoryToFile(chatHistory);
                        // 清空临时文件
                        await this.plugin.app.vault.modify(tempFile, '');
                        // 重置聊天历史
                        this.plugin.settings.chatHistory = [];
                        this.messages = [];
                        await this.plugin.saveSettings();
                        console.log('自动清空完成');
                    }
                } catch (error) {
                    console.error('处理自动清空时出错:', error);
                }
            }
        }

        // 创建主容器，分为左右两部分
        const mainContainer = this.containerEl.createDiv({
            cls: 'chat-ai-main-container',
            attr: {
                style: 'display: flex; height: 100%; width: 100%;'
            }
        });

        // 创建左侧面板 - 待开发区域
        const leftPanel = mainContainer.createDiv({
            cls: 'chat-ai-left-panel',
            attr: {
                style: `width: 250px; border-right: 1px solid var(--background-modifier-border); display: ${this.plugin.settings.showHistoryPanel ? 'flex' : 'none'}; flex-direction: column;`
            }
        });
        
        // 保存左侧面板的引用
        this.leftPanel = leftPanel;

        // 添加历史记录标题
        const historyTitle = leftPanel.createEl('h3', {
            text: '历史记录',
            attr: {
                style: 'margin: 12px; color: var(--text-normal); font-size: 1em; display: flex; justify-content: space-between; align-items: center;'
            }
        });
        
        // 在历史记录标题和历史记录列表之间插入搜索框
        const historySearch = leftPanel.createEl('input', {
            type: 'text',
            attr: {
                placeholder: '搜索历史记录...',
                style: 'margin: 0 12px 8px 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); font-size: 1em; outline: none;'
            }
        });

        // 搜索功能：输入时筛选历史记录
        historySearch.addEventListener('input', async (e) => {
            const keyword = e.target.value.trim();
            historyListContainer.empty();
            if (!keyword) {
                // 关键词为空，恢复原有渲染
                await this.onOpen();
                return;
            }
            const historyFiles = await this.plugin.getHistoryFiles();
            const matchedFiles = [];
            for (const file of historyFiles) {
                try {
                    const content = await this.app.vault.read(file);
                    if (content.includes(keyword)) {
                        matchedFiles.push(file);
                    }
                } catch (err) {
                    // 忽略读取失败的文件
                }
            }
            if (matchedFiles.length === 0) {
                historyListContainer.createEl('div', {
                    text: '未找到相关历史记录',
                    attr: {
                        style: 'color: var(--text-muted); text-align: center; padding: 20px;'
                    }
                });
                return;
            }
            // 只渲染匹配的历史项
            matchedFiles.forEach(file => {
                const isStarred = this.plugin.settings.starredHistoryFiles.includes(file.path);
                const historyItem = document.createElement('div');
                historyItem.className = `chat-ai-history-item ${isStarred ? 'chat-ai-starred' : ''}`;
                historyItem.style = 'padding: 8px; margin-bottom: 8px; border-radius: 4px; background: var(--background-modifier-hover); cursor: pointer; transition: background-color 0.2s; position: relative;';
                this.createHistoryItemContent(historyItem, file, isStarred);
                historyListContainer.appendChild(historyItem);
            });
        });
        
        // 添加扫帚图标
        const cleanIcon = historyTitle.createEl('span', {
            cls: 'chat-ai-clean-icon',
            attr: {
                style: 'cursor: pointer; font-size: 0.8em; opacity: 0.7;'
            }
        });
        cleanIcon.innerHTML = '🧹';
        
        // 添加鼠标悬停效果
        cleanIcon.addEventListener('mouseover', () => {
            cleanIcon.style.opacity = '1';
        });
        cleanIcon.addEventListener('mouseout', () => {
            cleanIcon.style.opacity = '0.7';
        });
        
        // 添加点击事件：清空非星标历史记录
        cleanIcon.addEventListener('click', async () => {
            // 获取所有历史文件
            const historyFiles = await this.plugin.getHistoryFiles();
            
            // 过滤出非星标文件
            const nonStarredFiles = historyFiles.filter(file => 
                !this.plugin.settings.starredHistoryFiles.includes(file.path)
            );
            
            // 无需确认，直接执行删除操作
            if (nonStarredFiles.length > 0) {
                // 先找到非星标文件对应的DOM元素并删除
                const normalSection = historyListContainer.querySelector('.chat-ai-history-section:not(:first-child)');
                if (normalSection) {
                    normalSection.remove();
                }
                
                // 删除分隔线
                const divider = historyListContainer.querySelector('.chat-ai-star-divider');
                if (divider) {
                    divider.remove();
                }
                
                // 删除非星标文件
                for (const file of nonStarredFiles) {
                    await this.app.vault.delete(file);
                }
                
                // 通知用户操作完成
                new Notice(`已删除 ${nonStarredFiles.length} 条记录`);
            } else {
                new Notice('没有可删除的非星标历史记录');
            }
        });

        // 创建历史记录列表容器
        const historyListContainer = leftPanel.createDiv({
            cls: 'chat-ai-history-list',
            attr: {
                style: 'flex: 1; overflow-y: auto; padding: 0 12px;'
            }
        });

        // 加载历史记录
        const historyFiles = await this.plugin.getHistoryFiles();
        
        // 创建通用的上下文菜单样式
        const menuStyle = document.createElement('style');
        menuStyle.textContent = `
            .chat-ai-context-menu {
                position: absolute;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
                z-index: 1000;
                overflow: hidden;
            }
            .chat-ai-context-menu-item {
                padding: 8px 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .chat-ai-context-menu-item:hover {
                background: var(--background-modifier-hover);
            }
            .chat-ai-context-menu-separator {
                height: 1px;
                background: var(--background-modifier-border);
                margin: 4px 0;
            }
            .chat-ai-starred {
                position: relative;
            }
            .chat-ai-starred::after {
                content: "★";
                position: absolute;
                top: 4px;
                right: 8px;
                color: var(--interactive-accent);
                font-size: 16px;
                cursor: pointer;
                z-index: 10;
            }
            .chat-ai-history-section {
                margin-bottom: 16px;
            }
            .chat-ai-history-section-title {
                font-size: 0.9em;
                color: var(--text-muted);
                margin: 0 0 8px 4px;
            }
            .chat-ai-star-divider {
                height: 1px;
                background: var(--background-modifier-border);
                margin: 12px 0;
            }
        `;
        document.head.appendChild(menuStyle);
        
        // 当前显示的上下文菜单
        let currentMenu = null;
        
        // 关闭上下文菜单的函数
        const closeContextMenu = () => {
            if (currentMenu) {
                currentMenu.remove();
                currentMenu = null;
            }
        };
        
        // 点击其他地方关闭菜单
        document.addEventListener('click', closeContextMenu);
        
        if (historyFiles.length > 0) {
            // 初始化星标文件列表（如果不存在）
            if (!this.plugin.settings.starredHistoryFiles) {
                this.plugin.settings.starredHistoryFiles = [];
            }
            
            // 将历史文件分为星标和非星标两组
            const starredFiles = [];
            const normalFiles = [];
            
            historyFiles.forEach(file => {
                const isStarred = this.plugin.settings.starredHistoryFiles.includes(file.path);
                if (isStarred) {
                    starredFiles.push(file);
                } else {
                    normalFiles.push(file);
                }
            });
            
            // 切换星标状态的函数
            const toggleStar = async (file, historyItem, isStarred) => {
                try {
                    // 处理星标状态
                    if (isStarred) {
                        // 移除星标
                        const index = this.plugin.settings.starredHistoryFiles.indexOf(file.path);
                        if (index > -1) {
                            this.plugin.settings.starredHistoryFiles.splice(index, 1);
                        }
                        
                        // 移除星标样式
                        historyItem.classList.remove('chat-ai-starred');
                        
                        // 获取DOM元素引用
                        const starredSection = historyListContainer.querySelector('.chat-ai-history-section:first-child');
                        const normalSection = historyListContainer.querySelector('.chat-ai-history-section:last-child');
                        const divider = historyListContainer.querySelector('.chat-ai-star-divider');
                        
                        // 如果普通区域不存在，创建一个
                        let normalSectionEl = normalSection;
                        if (!normalSectionEl) {
                            normalSectionEl = document.createElement('div');
                            normalSectionEl.className = 'chat-ai-history-section';
                            historyListContainer.appendChild(normalSectionEl);
                        }
                        
                        // 移动项目到普通区域
                        normalSectionEl.appendChild(historyItem);
                        
                        // 如果星标区域现在为空，隐藏星标区域和分隔线
                        if (starredSection && starredSection.querySelectorAll('.chat-ai-history-item').length === 0) {
                            starredSection.style.display = 'none';
                            if (divider) {
                                divider.style.display = 'none';
                            }
                        }
                        
                        // 保存设置
                        await this.plugin.saveSettings();
                        
                        new Notice('已移除星标');
                    } else {
                        // 添加星标
                        this.plugin.settings.starredHistoryFiles.push(file.path);
                        
                        // 获取DOM元素引用
                        let starredSection = historyListContainer.querySelector('.chat-ai-history-section:first-child');
                        const normalSection = historyListContainer.querySelector('.chat-ai-history-section:last-child');
                        let divider = historyListContainer.querySelector('.chat-ai-star-divider');
                        
                        // 如果星标区域不存在，需要创建星标区域
                        if (!starredSection || !starredSection.querySelector('.chat-ai-history-section-title')) {
                            // 创建星标区域
                            starredSection = document.createElement('div');
                            starredSection.className = 'chat-ai-history-section';
                            
                            // 创建标题
                            const sectionTitle = document.createElement('div');
                            sectionTitle.className = 'chat-ai-history-section-title';
                            sectionTitle.textContent = '星标历史记录';
                            starredSection.appendChild(sectionTitle);
                            
                            // 插入到列表最前面
                            if (historyListContainer.firstChild) {
                                historyListContainer.insertBefore(starredSection, historyListContainer.firstChild);
                            } else {
                                historyListContainer.appendChild(starredSection);
                            }
                            
                            // 如果存在普通记录，创建分隔线
                            if (normalSection && normalSection.querySelectorAll('.chat-ai-history-item').length > 0) {
                                divider = document.createElement('div');
                                divider.className = 'chat-ai-star-divider';
                                historyListContainer.insertBefore(divider, normalSection);
                            }
                        } else {
                            // 如果星标区域已存在但被隐藏，显示它和分隔线
                            starredSection.style.display = '';
                            if (divider) {
                                divider.style.display = '';
                            }
                        }
                        
                        // 添加星标样式
                        historyItem.classList.add('chat-ai-starred');
                        
                        // 创建星标点击区域
                        const starClickArea = document.createElement('div');
                        starClickArea.style = 'position: absolute; top: 4px; right: 8px; width: 20px; height: 20px; cursor: pointer; z-index: 20;';
                        starClickArea.addEventListener('click', async (e) => {
                            e.stopPropagation(); // 阻止事件冒泡到historyItem
                            await toggleStar(file, historyItem, true);
                        });
                        historyItem.appendChild(starClickArea);
                        
                        // 移动项目到星标区域
                        starredSection.appendChild(historyItem);
                        
                        // 保存设置
                        await this.plugin.saveSettings();
                        
                        new Notice('已添加星标');
                    }
                } catch (error) {
                    console.error('切换星标状态时出错:', error);
                    new Notice('操作失败: ' + error.message);
                }
            };
            
            // 创建历史记录项的函数
            const createHistoryItem = (file, isStarred = false, section = null) => {
                const historyItem = document.createElement('div');
                historyItem.className = `chat-ai-history-item ${isStarred ? 'chat-ai-starred' : ''}`;
                historyItem.style = 'padding: 8px; margin-bottom: 8px; border-radius: 4px; background: var(--background-modifier-hover); cursor: pointer; transition: background-color 0.2s; position: relative;';
                historyItem.setAttribute('data-path', file.path);
                
                // 添加悬停效果
                historyItem.addEventListener('mouseover', () => {
                    historyItem.style.backgroundColor = 'var(--background-primary-alt)';
                });
                historyItem.addEventListener('mouseout', () => {
                    historyItem.style.backgroundColor = 'var(--background-modifier-hover)';
                });
                
                // 创建历史记录项内容
                const itemContent = document.createElement('div');
                itemContent.style = 'display: flex; flex-direction: column; gap: 4px;';
                historyItem.appendChild(itemContent);
                
                // 添加文件名（日期）
                const filenameEl = document.createElement('div');
                filenameEl.textContent = file.basename.replace('.md', '');
                filenameEl.style = 'font-weight: 500; color: var(--text-normal);';
                filenameEl.setAttribute('data-filename', file.basename);
                itemContent.appendChild(filenameEl);
                
                // 添加时间元素 - 增强原有函数，确保有时间元素
                const timeEl = document.createElement('div');
                timeEl.textContent = this.formatDateTime ? this.formatDateTime(new Date(file.stat.mtime)) : 
                                    new Date(file.stat.mtime).toLocaleString();
                timeEl.style = 'font-size: 0.8em; color: var(--text-muted);';
                timeEl.className = 'chat-ai-history-item-time';
                itemContent.appendChild(timeEl);
                
                // 添加星标点击功能
                if (isStarred) {
                    // 创建星标点击区域（覆盖在CSS生成的星标上）
                    const starClickArea = document.createElement('div');
                    starClickArea.style = 'position: absolute; top: 4px; right: 8px; width: 20px; height: 20px; cursor: pointer; z-index: 20;';
                    starClickArea.addEventListener('click', async (e) => {
                        e.stopPropagation(); // 阻止事件冒泡到historyItem
                        await toggleStar(file, historyItem, isStarred);
                    });
                    historyItem.appendChild(starClickArea);
                }
                
                // 添加右键菜单
                historyItem.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    closeContextMenu();
                    
                    // 创建上下文菜单
                    const contextMenu = document.createElement('div');
                    contextMenu.className = 'chat-ai-context-menu';
                    currentMenu = contextMenu;
                    
                    // 重命名选项
                    const renameItem = document.createElement('div');
                    renameItem.className = 'chat-ai-context-menu-item';
                    renameItem.innerHTML = '<svg viewBox="0 0 100 100" width="16" height="16" class="svg-icon"><path fill="currentColor" d="M78.9,25.8l-5.7-5.7c-1.7-1.7-4.5-1.7-6.2,0l-5.1,5.1l11.9,11.9l5.1-5.1C80.6,30.3,80.6,27.5,78.9,25.8z"></path><path fill="currentColor" d="M52.7,34.4L16.2,70.9l-4.4,16.3l16.3-4.4l36.5-36.5L52.7,34.4z M24.2,76.2l-4.6,1.2l1.2-4.6l28.5-28.5l3.4,3.4L24.2,76.2z"></path></svg> 重命名';
                    renameItem.addEventListener('click', async () => {
                        closeContextMenu();
                        
                        // 创建输入对话框
                        const modal = new TextEditModal(
                            this.app,
                            '重命名历史记录',
                            file.basename,
                            async (newName) => {
                                try {
                                    // 确保文件名有扩展名
                                    if (!newName.endsWith('.md')) {
                                        newName += '.md';
                                    }
                                    
                                    // 获取新的文件路径
                                    const dirPath = file.path.substring(0, file.path.lastIndexOf('/') + 1);
                                    const newPath = dirPath + newName;
                                    
                                    // 重命名文件
                                    await this.app.vault.rename(file, newPath);
                                    
                                    // 更新星标列表中的路径
                                    if (this.plugin.settings.starredHistoryFiles) {
                                        const index = this.plugin.settings.starredHistoryFiles.indexOf(file.path);
                                        if (index > -1) {
                                            this.plugin.settings.starredHistoryFiles[index] = newPath;
                        await this.plugin.saveSettings();
                                        }
                                    }
                                    
                                    // 更新当前历史文件路径
                                    if (this.plugin.settings.currentHistoryFile === file.path) {
                                        this.plugin.settings.currentHistoryFile = newPath;
                                        await this.plugin.saveSettings();
                                    }
                                    
                                    // 更新UI
                                    const filenameEl = historyItem.querySelector('[data-filename]');
                                    if (filenameEl) {
                                        filenameEl.textContent = newName.replace('.md', '');
                                        filenameEl.setAttribute('data-filename', newName);
                                    }
                                    
                                    // 更新路径显示
                                    const pathEl = historyItem.querySelector('.chat-ai-history-item > div > div:nth-child(2)');
                                    if (pathEl) {
                                        pathEl.textContent = newPath;
                                    }
                                    
                                    // 更新数据属性
                                    historyItem.setAttribute('data-path', newPath);
                                    
                                    new Notice('历史记录已重命名');
                                } catch (error) {
                                    console.error('重命名历史记录时出错:', error);
                                    new Notice('重命名失败: ' + error.message);
                                }
                            }
                        );
                        modal.open();
                    });
                    contextMenu.appendChild(renameItem);
                    
                    // 分隔线
                    const separator1 = document.createElement('div');
                    separator1.className = 'chat-ai-context-menu-separator';
                    contextMenu.appendChild(separator1);
                    
                    // 星标选项
                    const starItem = document.createElement('div');
                    starItem.className = 'chat-ai-context-menu-item';
                    
                    // 如果文件已经有星标，显示取消星标选项
                    if (isStarred) {
                        starItem.innerHTML = '<svg viewBox="0 0 100 100" width="16" height="16" class="svg-icon"><path fill="currentColor" d="M50,77.5l-25.9,13.6l4.9-28.9L8.2,41.8l28.9-4.2L50,12.5l12.9,25.1l28.9,4.2L71,62.2l4.9,28.9L50,77.5z"></path></svg> 取消星标';
                    } else {
                        starItem.innerHTML = '<svg viewBox="0 0 100 100" width="16" height="16" class="svg-icon"><path fill="currentColor" d="M50,77.5l-25.9,13.6l4.9-28.9L8.2,41.8l28.9-4.2L50,12.5l12.9,25.1l28.9,4.2L71,62.2l4.9,28.9L50,77.5z"></path></svg> 添加星标';
                    }
                    
                    starItem.addEventListener('click', async () => {
                        closeContextMenu();
                        await toggleStar(file, historyItem, isStarred);
                    });
                    contextMenu.appendChild(starItem);
                    
                    // 分隔线
                    const separator2 = document.createElement('div');
                    separator2.className = 'chat-ai-context-menu-separator';
                    contextMenu.appendChild(separator2);
                    
                    // 删除选项
                    const deleteItem = document.createElement('div');
                    deleteItem.className = 'chat-ai-context-menu-item';
                    deleteItem.innerHTML = '<svg viewBox="0 0 100 100" width="16" height="16" class="svg-icon"><path fill="currentColor" d="M76.9,31.1c0.7,0,1.3,0.6,1.3,1.3v5.5c0,0.7-0.6,1.3-1.3,1.3h-53c-0.7,0-1.3-0.6-1.3-1.3v-5.5c0-0.7,0.6-1.3,1.3-1.3H76.9z"></path><path fill="currentColor" d="M68.3,17.2h-36l-7.9,8.7h51.7L68.3,17.2z"></path><path fill="currentColor" d="M27.4,43v35.4c0,2.8,2.3,5.1,5.1,5.1h35.5c2.8,0,5.1-2.3,5.1-5.1V43H27.4z M54.7,71.8c0,1.3-1.1,2.4-2.4,2.4 c-1.3,0-2.4-1.1-2.4-2.4V50.9c0-1.3,1.1-2.4,2.4-2.4c1.3,0,2.4,1.1,2.4,2.4V71.8z M66,71.8c0,1.3-1.1,2.4-2.4,2.4 c-1.3,0-2.4-1.1-2.4-2.4V50.9c0-1.3,1.1-2.4,2.4-2.4c1.3,0,2.4,1.1,2.4,2.4V71.8z M43.4,71.8c0,1.3-1.1,2.4-2.4,2.4 c-1.3,0-2.4-1.1-2.4-2.4V50.9c0-1.3,1.1-2.4,2.4-2.4c1.3,0,2.4,1.1,2.4,2.4V71.8z"></path></svg> 删除';
                    deleteItem.style.color = 'var(--text-error)';
                    
                    deleteItem.addEventListener('click', async () => {
                        closeContextMenu();
                        
                        // 直接删除文件，无需确认
                        try {
                            // 删除文件
                            await this.app.vault.delete(file);
                            
                            // 如果有星标，移除星标
                            if (this.plugin.settings.starredHistoryFiles) {
                                const index = this.plugin.settings.starredHistoryFiles.indexOf(file.path);
                                if (index > -1) {
                                    this.plugin.settings.starredHistoryFiles.splice(index, 1);
                                    await this.plugin.saveSettings();
                                }
                            }
                            
                            // 如果是当前加载的历史记录，清空当前记录
                            if (this.plugin.settings.currentHistoryFile === file.path) {
                                this.plugin.settings.currentHistoryFile = '';
                                this.plugin.settings.chatHistory = [];
                                this.messages = [];
                                this.messagesContainer.empty();
                                await this.plugin.saveSettings();
                            }
                            
                            // 移除历史记录项
                            historyItem.remove();
                            
                            // 获取历史项所在的区域
                            const section = historyItem.closest('.chat-ai-history-section');
                            
                            // 如果区域中没有其他历史项，隐藏该区域
                            if (section && section.querySelectorAll('.chat-ai-history-item').length === 0) {
                                section.style.display = 'none';
                                
                                // 如果是星标区域，也移除分隔线
                                if (section.querySelector('.chat-ai-history-section-title')?.textContent.includes('星标')) {
                                    const divider = section.nextElementSibling;
                                    if (divider && divider.classList.contains('chat-ai-star-divider')) {
                                        divider.remove();
                                    }
                                }
                            }
                            
                            // 如果没有任何历史记录，显示暂无历史记录提示
                            const historyListContainer = section.parentElement;
                            if (historyListContainer.querySelectorAll('.chat-ai-history-item').length === 0) {
                                historyListContainer.innerHTML = '';
                                const emptyMessage = document.createElement('div');
                                emptyMessage.textContent = '暂无历史记录';
                                emptyMessage.style = 'color: var(--text-muted); text-align: center; padding: 20px;';
                                historyListContainer.appendChild(emptyMessage);
                            }
                            
                        } catch (error) {
                            console.error('删除历史记录时出错:', error);
                            new Notice('删除失败: ' + error.message);
                        }
                    });
                    contextMenu.appendChild(deleteItem);
                    
                    // 添加菜单到页面
                    document.body.appendChild(contextMenu);
                    
                    // 定位菜单
                    contextMenu.style.left = `${e.clientX}px`;
                    contextMenu.style.top = `${e.clientY}px`;
                    
                    // 确保菜单不超出屏幕
                    const menuRect = contextMenu.getBoundingClientRect();
                    if (menuRect.right > window.innerWidth) {
                        contextMenu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
                    }
                    if (menuRect.bottom > window.innerHeight) {
                        contextMenu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
                    }
                });
                
                // 添加点击事件
                historyItem.addEventListener('click', async () => {
                    try {
                        // 加载历史记录
                        const chatHistory = await this.plugin.loadHistoryFile(file);
                        if (chatHistory && chatHistory.length > 0) {
                            // 更新当前消息
                            this.messages = chatHistory;
                            this.plugin.settings.chatHistory = chatHistory;
                            this.plugin.settings.currentHistoryFile = file.path;
                            await this.plugin.saveSettings();
                            
                            // 重新渲染消息
                            this.renderMessages();
                            
                            // 显示通知
                            new Notice('已加载历史记录');
                        }
                    } catch (error) {
                        console.error('加载历史记录时出错:', error);
                        new Notice('加载历史记录失败');
                    }
                });
                
                if (section) {
                    section.appendChild(historyItem);
                } else {
                    return historyItem;
                }
            };
            
            // 创建星标历史记录部分
            if (starredFiles.length > 0) {
                const starredSection = document.createElement('div');
                            starredSection.className = 'chat-ai-history-section';
                            
                            const sectionTitle = document.createElement('div');
                            sectionTitle.className = 'chat-ai-history-section-title';
                            sectionTitle.textContent = '星标历史记录';
                            starredSection.appendChild(sectionTitle);
                            
                starredFiles.forEach(file => {
                    createHistoryItem(file, true, starredSection);
                });
                
                                historyListContainer.appendChild(starredSection);
                
                // 如果同时有星标和非星标历史记录，添加分隔线
                if (normalFiles.length > 0) {
                    const divider = document.createElement('div');
                                divider.className = 'chat-ai-star-divider';
                    historyListContainer.appendChild(divider);
                }
            }
            
            // 创建普通历史记录部分
            if (normalFiles.length > 0) {
                const normalSection = document.createElement('div');
                normalSection.className = 'chat-ai-history-section';
                
                if (starredFiles.length > 0) {
                    const sectionTitle = document.createElement('div');
                    sectionTitle.className = 'chat-ai-history-section-title';
                    sectionTitle.textContent = '历史记录';
                    normalSection.appendChild(sectionTitle);
                }
                
                normalFiles.forEach(file => {
                    createHistoryItem(file, false, normalSection);
                });
                
                historyListContainer.appendChild(normalSection);
                            }
                        } else {
            // 如果没有历史记录，显示提示信息
            historyListContainer.createEl('div', {
                text: '暂无历史记录',
                attr: {
                    style: 'color: var(--text-muted); text-align: center; padding: 20px;'
                }
            });
        }

        // 创建右侧面板 - 包含所有现有元素
        const rightPanel = mainContainer.createDiv({
            cls: 'chat-ai-right-panel',
            attr: {
                style: 'flex: 1; display: flex; flex-direction: column; overflow: hidden;'
            }
        });
        
        // 保存右侧面板的引用
        this.rightPanel = rightPanel;

        // 继续创建UI元素，但放在右侧面板中
        // 创建导航头部
        const navHeader = rightPanel.createDiv('nav-header');
        const navButtonsContainer = navHeader.createDiv('nav-buttons-container');

  
        // 统一的按钮样式
        const buttonStyle = 'margin: 0; display: inline-block; width: 80px; text-align: center; white-space: nowrap;';

        // 统一的下拉菜单样式
        const selectStyle = 'flex: 1; padding: 4px; border-radius: 4px; background: var(--background-modifier-form-field); width: 80px;';

        // 创建按钮，添加统一样式
        const newConversationButton = navButtonsContainer.createEl('button', { 
            cls: 'chat-ai-header-button', 
            text: '新建',
            attr: { style: buttonStyle }
        });
        const clearButton = navButtonsContainer.createEl('button', { 
            cls: 'chat-ai-header-button', 
            text: '清空',
            attr: { style: buttonStyle }
        });
        const settingsButton = navButtonsContainer.createEl('button', { 
            cls: 'chat-ai-header-button', 
            text: '设置',
            attr: { style: buttonStyle }
        });

        // 在设置按钮后立即添加代理开关
        const proxyToggle = navButtonsContainer.createEl('button', {
            cls: 'chat-ai-header-button proxy-toggle',
            text: this.plugin.settings.useProxy ? '代理已开启' : '代理已关闭',
            attr: { style: buttonStyle }
        });
        
        // 添加历史面板切换按钮
        const historyPanelToggle = navButtonsContainer.createEl('button', {
            cls: 'chat-ai-header-button history-panel-toggle',
            text: this.plugin.settings.showHistoryPanel ? '隐藏历史' : '显示历史',
            attr: { style: buttonStyle }
        });
        
        // 添加历史面板切换按钮的点击事件
        historyPanelToggle.addEventListener('click', async () => {
            // 切换历史面板显示状态
            this.plugin.settings.showHistoryPanel = !this.plugin.settings.showHistoryPanel;
            
            // 更新按钮文本
            historyPanelToggle.textContent = this.plugin.settings.showHistoryPanel ? '隐藏历史' : '显示历史';
            
            // 更新左侧面板显示状态
            if (this.leftPanel) {
                this.leftPanel.style.display = this.plugin.settings.showHistoryPanel ? 'flex' : 'none';
            }
            
            // 保存设置
            await this.plugin.saveSettings();
        });

        proxyToggle.addEventListener('click', async () => {
            this.plugin.settings.useProxy = !this.plugin.settings.useProxy;
            proxyToggle.textContent = this.plugin.settings.useProxy ? '代理已开启' : '代理已关闭';
            await this.plugin.saveSettings();
        });

        // 创建下拉菜单容器
        const dropdownsContainer = navButtonsContainer.createDiv({
            cls: 'header-dropdowns',
            attr: {
                style: 'display: flex; gap: 5px; flex: 1; margin-left: 5px;'
            }
        });

        // 修改下拉菜单的样式
        const baseUrlSelect = dropdownsContainer.createEl('select', {
            cls: 'chat-ai-dropdown',
            attr: { style: selectStyle }
        });

        const apiKeySelect = dropdownsContainer.createEl('select', {
            cls: 'chat-ai-dropdown',
            attr: { style: selectStyle }
        });

        const modelSelect = dropdownsContainer.createEl('select', {
            cls: 'chat-ai-dropdown',
            attr: { style: selectStyle }
        });

        // Base URL 下拉菜单
        this.plugin.settings.baseUrl.forEach(url => {
            const urlMatch = url.match(/(.*?)(https?:\/\/\S+)/);
            const displayText = urlMatch && urlMatch[1].trim() 
                ? urlMatch[1].trim()  // 如果有备注就只显示备注
                : url;  // 没有备注才显示完整URL
            const option = baseUrlSelect.createEl('option', {
                text: displayText,
                value: url
            });
            if (url === this.plugin.settings.currentBaseUrl) {
                option.selected = true;
            }
        });
        baseUrlSelect.addEventListener('change', async (e) => {
            this.plugin.settings.currentBaseUrl = e.target.value;
            await this.plugin.saveSettings();
        });
        
        // 添加右键菜单事件
        baseUrlSelect.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const modal = new ParameterEditModal(
                this.app, 
                this.plugin, 
                'vendor', 
                this.plugin.settings.currentBaseUrl,
                async () => {
                    await this.plugin.saveSettings();
                    await this.updateDropdowns();
                }
            );
            modal.open();
        });

        // API Key 下拉菜单
        this.plugin.settings.apiKey.forEach(line => {
            const { note, key } = parseKeyEntry(line);
            const trimmedLine = line.trim();
            const displayText = note
                ? note
                : (key ? `${key.substring(0, 10)}...` : trimmedLine);
            const option = apiKeySelect.createEl('option', {
                text: displayText,
                value: trimmedLine
            });
            if (trimmedLine === this.plugin.settings.currentApiKey) {
                option.selected = true;
            }
        });
        apiKeySelect.addEventListener('change', async (e) => {
            this.plugin.settings.currentApiKey = e.target.value;
            await this.plugin.saveSettings();
        });
        
        // 添加API Key右键菜单事件
        apiKeySelect.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const modal = new ParameterEditModal(
                this.app, 
                this.plugin, 
                'key', 
                this.plugin.settings.currentApiKey,
                async () => {
                    await this.plugin.saveSettings();
                    await this.updateDropdowns();
                }
            );
            modal.open();
        });

        // Model 下拉菜单
        this.plugin.settings.model.forEach(model => {
            const option = modelSelect.createEl('option', {
                text: model,
                value: model
            });
            if (model === this.plugin.settings.currentModel) {
                option.selected = true;
            }
        });
        modelSelect.addEventListener('change', async (e) => {
            this.plugin.settings.currentModel = e.target.value;
            await this.plugin.saveSettings();
        });
        
        // 添加模型右键菜单事件
        modelSelect.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const modal = new ParameterEditModal(
                this.app, 
                this.plugin, 
                'model', 
                this.plugin.settings.currentModel,
                async () => {
                    await this.plugin.saveSettings();
                    await this.updateDropdowns();
                }
            );
            modal.open();
        });

        // 在 dropdownsContainer 后添加温度控制容器
        const temperatureContainer = navButtonsContainer.createDiv({
            cls: 'temperature-container',
            attr: {
                style: 'display: flex; align-items: center; gap: 4px; margin-left: 8px;'
            }
        });

        // 添加温度标签
        temperatureContainer.createSpan({
            text: '温度:',
            attr: {
                style: 'font-size: var(--font-ui-smaller); opacity: 0.8;'
            }
        });

        // 添加温度值显示
        const temperatureValue = temperatureContainer.createSpan({
            text: this.plugin.settings.temperature.toFixed(1),
            attr: {
                style: 'font-size: var(--font-ui-smaller); min-width: 24px; text-align: center;'
            }
        });

        // 添加温度滑块
        const temperatureSlider = temperatureContainer.createEl('input', {
            type: 'range',
            cls: 'chat-ai-temperature-slider',
            attr: {
                min: '0',
                max: '2',
                step: '0.1',
                value: this.plugin.settings.temperature,
                style: `
                    width: 80px;
                    height: 4px;
                    -webkit-appearance: none;
                    background: var(--interactive-accent);
                    border-radius: 2px;
                    outline: none;
                    opacity: 0.8;
                    transition: opacity 0.2s;
                `
            }
        });

        // 添加滑块样式
        const sliderStyle = document.createElement('style');
        sliderStyle.textContent = `
            .chat-ai-temperature-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: var(--interactive-accent);
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .chat-ai-temperature-slider::-webkit-slider-thumb:hover {
                transform: scale(1.2);
            }
            
            .chat-ai-temperature-slider:hover {
                opacity: 1;
            }
        `;
        document.head.appendChild(sliderStyle);

        // 添加滑块事件监听
        temperatureSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            temperatureValue.textContent = value.toFixed(1);
            this.plugin.settings.temperature = value;
            this.plugin.saveSettings();
        });

        // 添加事件监听
        newConversationButton.addEventListener('click', async () => {
            await this.handleNewConversation();
        });

        clearButton.addEventListener('click', async () => {
            if (this.messages.length === 0) {
                new Notice('没有对话内容可清空');
                return;
            }
            this.messages = [];
            this.messagesContainer.empty();
            this.plugin.settings.chatHistory = [];
            this.plugin.saveSettings();
            // 清空时也更新临时文件
            await this.saveTempChatHistory();
            // new Notice('对话记录已清空');
        });

        settingsButton.addEventListener('click', () => {
            // 不再打开自定义的设置模态框
            // new SettingsModal(this.app, this).open();
            
            // 打开Obsidian的插件设置页面，并精确定位到本插件
            this.app.setting.open();
            this.app.setting.openTabById('qinghuan-ai');
        });

        // 消息显示域
        this.messagesContainer = rightPanel.createDiv({ cls: 'chat-ai-messages' });

        // 创建图片预览区域，放置在输入区域上方
        this.imagePreviewArea = rightPanel.createDiv({
            cls: 'chat-ai-image-preview',
            attr: {
                style: 'display: none; width: 100%; padding: 8px; background: var(--background-primary-alt); border-bottom: 1px solid var(--background-modifier-border);' // 添加适当样式
            }
        });

        // 创建输入域
        const inputArea = rightPanel.createDiv({
            cls: 'chat-ai-input-area',
            attr: {
                style: 'display: flex; flex-direction: column; padding: 12px; gap: 8px; position: relative;'
            }
        });

        // 创建拖拽手柄
        const dragHandle = inputArea.createDiv({
            cls: 'qinghuan-ai-drag-handle'
        });

        
        // 添加拖拽功能来调节输入框高度
        this.initializeDragResize(dragHandle, inputArea);

        // 从设置中恢复保存的高度
        if (this.plugin.settings.inputAreaHeight) {
            const savedHeight = this.plugin.settings.inputAreaHeight;
            if (savedHeight >= 80 && savedHeight <= 400) {
                // 延迟应用保存的高度，确保DOM元素已完全创建
                setTimeout(() => {
                    inputArea.style.setProperty('height', savedHeight + 'px', 'important');
                    inputArea.style.setProperty('min-height', savedHeight + 'px', 'important');
                    inputArea.style.setProperty('max-height', savedHeight + 'px', 'important');
                    inputArea.style.setProperty('flex', `0 0 ${savedHeight}px`, 'important');

                    // 同时调整textarea高度
                    if (this.textarea) {
                        const textareaHeight = Math.max(40, savedHeight - 60);
                        this.textarea.style.setProperty('max-height', textareaHeight + 'px', 'important');
                        this.textarea.style.setProperty('min-height', textareaHeight + 'px', 'important');
                        this.textarea.style.setProperty('height', textareaHeight + 'px', 'important');
                    }
                }, 100);
            }
        }

        // 创建输入框和按钮的容
        const inputButtonContainer = inputArea.createDiv({
            attr: {
                style: 'display: flex; gap: 8px;'
            }
        });

        // 创建左侧输入框
        this.textarea = inputButtonContainer.createEl('textarea', {
            cls: 'chat-ai-textarea',
            attr: {
                rows: 3,
                placeholder: '此处输入……',
                style: 'flex: 1; min-height: 60px; max-height: 200px; margin: 0; padding: 12px; box-sizing: border-box; line-height: 1.5; resize: none;'
            }
        });

        // 创建右侧按钮容器
        const buttonContainer = inputButtonContainer.createDiv({
            attr: {
                style: 'display: flex; flex-direction: column; gap: 8px; width: 80px;'
            }
        });

        // 创建发送按钮
        this.sendButton = buttonContainer.createEl('button', { 
            cls: 'chat-ai-send-button', 
            text: '发送',
            attr: {
                style: 'height: 40px; width: 100%;'
            }
        });

        // 创建图片上传按钮
        const uploadButton = buttonContainer.createEl('button', {
            cls: 'chat-ai-upload-button',
            attr: {
                style: 'height: 32px; width: 100%; background: var(--background-modifier-border); border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;'
            }
        });
        setIcon(uploadButton, 'image');

        // 绑定事件
        this.sendButton.addEventListener('click', () => this.handleSendMessage());
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
        
        // 添加图片上传按钮的点击事件
        uploadButton.addEventListener('click', () => {
            this.fileInput.click();
        });

        // 加载并渲染已有的对话历史
        await this.loadChatHistory();

        // 添加悬停提示
        const addHoverTooltip = (selectEl) => {
            let tooltipTimeout;
            let tooltipEl;

            selectEl.addEventListener('mouseover', (e) => {
                if (e.target.scrollWidth > e.target.offsetWidth) {
                    tooltipTimeout = setTimeout(() => {
                        tooltipEl = document.createElement('div');
                        tooltipEl.className = 'select-tooltip';
                        tooltipEl.textContent = e.target.value;
                        document.body.appendChild(tooltipEl);

                        const rect = e.target.getBoundingClientRect();
                        tooltipEl.style.left = `${rect.left}px`;
                        tooltipEl.style.top = `${rect.bottom + 5}px`;
                    }, 1000);
                }
            });

            selectEl.addEventListener('mouseout', () => {
                clearTimeout(tooltipTimeout);
                if (tooltipEl) {
                    tooltipEl.remove();
                    tooltipEl = null;
                }
            });
        };

        // 为每个下拉菜单添加悬停提示
        [baseUrlSelect, apiKeySelect, modelSelect].forEach(select => {
            addHoverTooltip(select);
        });

        // 监听主题变化
        this.registerThemeObserver();

        // 初始化图片上传功能
        this.initializeImageUpload();

        // 添加样式
        this.addStyle();
        
        // 创建滚动按钮
        this.createScrollButtons();

        // 修改自动聚焦逻辑
        if (this.plugin.settings.autoFocus) {
            console.log('Attempting to focus textarea...');
            setTimeout(() => {
                if (this.textarea) {
                    console.log('Textarea found, focusing...');
                    this.textarea.focus();
                } else {
                    console.log('Textarea not found!');
                }
            }, 100);
        }

        // 根据专注模式设置样式
        if (this.plugin.settings.focusMode) {
            this.containerEl.addClass('focus-mode');
        } else {
            this.containerEl.removeClass('focus-mode');
        }

        // 应用保存的字体大小
        this.applyFontSize();
        
        // 添加滚轮事件监听
        this.containerEl.addEventListener('wheel', this.handleWheel);

        // 在创建 modelSelect 后添加
        const systemMessageSelect = dropdownsContainer.createEl('select', {
            cls: 'chat-ai-dropdown',
            attr: { style: selectStyle }
        });

        // 加载system message文件列表
        this.loadSystemMessageFiles(systemMessageSelect);

        // 设置当前选中的system message
        if (this.plugin.settings.currentSystemMessageFile) {
            systemMessageSelect.value = this.plugin.settings.currentSystemMessageFile;
        }

        // 添加变更事件监听
        systemMessageSelect.addEventListener('change', async (e) => {
            const selectedFile = e.target.value;
            this.plugin.settings.currentSystemMessageFile = selectedFile;
            
            if (selectedFile) {
                const filePath = `${this.plugin.settings.systemMessagePath}/${selectedFile}`;
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    const content = await this.plugin.app.vault.read(file);
                    this.plugin.settings.currentSystemMessage = content;
                }
            } else {
                this.plugin.settings.currentSystemMessage = '';
            }
            
            await this.plugin.saveSettings();
        });

        // 移除旧的事件监听器
        systemMessageSelect.removeEventListener('mousedown', this._systemMessageSelectMousedownHandler);
        systemMessageSelect.removeEventListener('focus', this._systemMessageSelectFocusHandler);

        // 添加点击事件，在下拉菜单打开前重新加载系统消息文件列表
        systemMessageSelect.addEventListener('click', async () => {
            // 重新加载系统消息文件列表
            await this.loadSystemMessageFiles(systemMessageSelect);
            
            // 保持选中当前选项
            if (this.plugin.settings.currentSystemMessageFile) {
                systemMessageSelect.value = this.plugin.settings.currentSystemMessageFile;
            }
        });

        // 聚焦事件
        systemMessageSelect.addEventListener('focus', async () => {
            // 聚焦时重新加载系统消息文件列表
            await this.loadSystemMessageFiles(systemMessageSelect);
            
            // 保持选中当前选项
            if (this.plugin.settings.currentSystemMessageFile) {
                systemMessageSelect.value = this.plugin.settings.currentSystemMessageFile;
            }
        });

        // 添加右键菜单事件
        systemMessageSelect.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            if (e.ctrlKey) {
                const selectedFile = systemMessageSelect.value;
                if (selectedFile) {
                    const filePath = `${this.plugin.settings.systemMessagePath}/${selectedFile}`;
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile) {
                        const leaf = this.app.workspace.getLeaf(true);
                        await leaf.openFile(file);
                    }
                }
            } else {
            // 打开System Message管理弹窗
            const modal = new SystemMessageManageModal(this.app, this.plugin);
            modal.open();
            }
        });

        // 注册 System Message 文件变更监听
        this.registerSystemMessageWatcher();

        // 在 System Message 下拉菜单后添加流式模式开关
        const streamingToggleContainer = dropdownsContainer.createDiv({
            cls: 'streaming-toggle-container',
            attr: {
                style: 'display: flex; align-items: center; gap: 4px; margin-left: 8px;'
            }
        });

        // 添加流式模式标签
        streamingToggleContainer.createSpan({
            text: '流式:',
            attr: {
                style: 'font-size: var(--font-ui-smaller); opacity: 0.8; white-space: nowrap;'
            }
        });

        // 添加流式模式开关按钮
        const streamingToggle = streamingToggleContainer.createEl('button', {
            cls: 'chat-ai-streaming-toggle',
            text: this.plugin.settings.useStreaming ? 'ON' : 'OFF',
            attr: {
                style: `
                    padding: 2px 8px;
                    font-size: var(--font-ui-smaller);
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 4px;
                    background: ${this.plugin.settings.useStreaming ? 'var(--interactive-accent)' : 'var(--background-modifier-form-field)'};
                    color: ${this.plugin.settings.useStreaming ? 'var(--text-on-accent)' : 'var(--text-normal)'};
                    cursor: pointer;
                    transition: all 0.2s ease;
                    min-width: 32px;
                `
            }
        });

        // 添加开关事件监听
        streamingToggle.addEventListener('click', async () => {
            this.plugin.settings.useStreaming = !this.plugin.settings.useStreaming;
            await this.plugin.saveSettings();
            
            // 更新按钮样式和文本
            streamingToggle.textContent = this.plugin.settings.useStreaming ? 'ON' : 'OFF';
            streamingToggle.style.background = this.plugin.settings.useStreaming ? 'var(--interactive-accent)' : 'var(--background-modifier-form-field)';
            streamingToggle.style.color = this.plugin.settings.useStreaming ? 'var(--text-on-accent)' : 'var(--text-normal)';
        });

        // 在创建完主UI后，添加配置按钮（在消息显示域之前）
        this.renderConfigButtons();
    }

    // 新增：处理新建对话
    async handleNewConversation() {
        if (this.messages.length > 0) {
            try {
                await this.plugin.saveChatHistoryToFile(this.messages);
            } catch (error) {
                console.error('保存对话历史时出错:', error);
                new Notice('保存对话历史时出错');
                return;
            }
        }
        // 清空当前对话
        this.messages = [];
        this.messagesContainer.empty();
        this.plugin.settings.chatHistory = [];
        this.plugin.settings.currentHistoryFile = '';
        await this.plugin.saveSettings();

        // 移除对 autoFocus 设置的检查，新建后总是聚焦
        setTimeout(() => {
            if (this.textarea) {
                this.textarea.focus();
            }
        }, 100);
    }

    async handleSendMessage() {
        const content = this.textarea.value.trim();
        if (!content && this.pendingImages.length === 0) return;

        // 重置自动滚动状态
        this.autoScroll = true;  // 添加这一行

        // 设置正在接收AI回复的状态
        this.isReceivingResponse = true;
        
        // 保存图片URL到消息中
        const messageWithImages = {
            role: 'user',
            content: content,
            time: new Date(),
            images: [...this.pendingImages]
        };

        this.addMessage(messageWithImages.role, messageWithImages.content, messageWithImages.time, true, messageWithImages.images);
        this.textarea.value = '';
        this.scrollToBottom();

        // 清空图片预览区域和待发送图片数组
        this.imagePreviewArea.style.display = 'none';
        this.imagePreviewArea.empty();
        this.pendingImages = [];
        
        // 如果是在查看历史记录，就更新该历史记录文件
        if (this.plugin.settings.currentHistoryFile) {
            try {
                // 更新历史记录文件
                let content = '';
                this.messages.forEach(msg => {
                    let timeStr = 'Time N/A'; // 默认时间占位符
                    if (msg.time) { // 检查 msg.time 是否存在
                        try {
                            // 尝试将 msg.time 转换为 Date 对象（如果它还不是）
                            const dateObject = msg.time instanceof Date ? msg.time : new Date(msg.time);
                            
                            // 检查转换后的对象是否是有效的 Date
                            if (dateObject instanceof Date && !isNaN(dateObject.getTime())) {
                                timeStr = dateObject.toLocaleTimeString(); 
                            } else {
                                console.warn("保存历史记录时遇到无效的时间格式:", msg.time);
                                // 如果原始值是字符串，可以考虑显示原始字符串
                                if (typeof msg.time === 'string') {
                                   timeStr = `Invalid (${msg.time})`;
                                }
                            }
                        } catch (e) {
                             console.error("处理消息时间时出错:", msg.time, e);
                             if (typeof msg.time === 'string') {
                                   timeStr = `Error (${msg.time})`;
                             } else {
                                   timeStr = '处理时间出错';
                             }
                        }
                    }
                     const speaker = msg.role === 'user' ? '你' : 'AI';
                    content += `### ${speaker} (${timeStr})\n\n${msg.content}\n\n`;
                });
                
                const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.currentHistoryFile);
                if (file instanceof TFile) {
                    await this.plugin.app.vault.modify(file, content);
                }
            } catch (error) {
                console.error('更新历史记录文件失败:', error);
                new Notice('更新历史记录失败');
            }
        }
        
        // 保存到临时文件
        await this.saveTempChatHistory();

        // 创建一个临时的助手消息容器
        const assistantMessage = this.createAssistantMessageElement();
        this.scrollToBottom();

        try {
            await this.callAI(assistantMessage);
            // AI回复完成后保存到临时文件和历史记录文件（如果有）
            await this.saveTempChatHistory();
            if (this.plugin.settings.currentHistoryFile) {
                try {
                    let content = '';
                    this.messages.forEach(msg => {
                        let timeStr = 'Time N/A'; // 默认时间占位符
                        if (msg.time) { // 检查 msg.time 是否存在
                            try {
                                // 尝试将 msg.time 转换为 Date 对象（如果它还不是）
                                const dateObject = msg.time instanceof Date ? msg.time : new Date(msg.time);
                                
                                // 检查转换后的对象是否是有效的 Date
                                if (dateObject instanceof Date && !isNaN(dateObject.getTime())) {
                                    timeStr = dateObject.toLocaleTimeString(); 
                                } else {
                                    console.warn("保存历史记录时遇到无效的时间格式:", msg.time);
                                    // 如果原始值是字符串，可以考虑显示原始字符串
                                    if (typeof msg.time === 'string') {
                                       timeStr = `Invalid (${msg.time})`;
                                    }
                                }
                            } catch (e) {
                                 console.error("处理消息时间时出错:", msg.time, e);
                                 if (typeof msg.time === 'string') {
                                       timeStr = `Error (${msg.time})`;
                                 } else {
                                       timeStr = '处理时间出错';
                                 }
                            }
                        }
                         const speaker = msg.role === 'user' ? '你' : 'AI';
                        content += `### ${speaker} (${timeStr})\n\n${msg.content}\n\n`;
                    });
                    
                    const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.currentHistoryFile);
                    if (file instanceof TFile) {
                        await this.plugin.app.vault.modify(file, content);
                    }
                } catch (error) {
                    console.error('更新历史记录文件失败:', error);
                    new Notice('更新历史记录失败');
                }
            }
            // 更新下拉菜单显示
            await this.updateDropdowns();
        } catch (error) {
            console.error('调用AI时发生错误:', error);
            assistantMessage.querySelector('.message-content').textContent = `错误: ${error.message}`;
            new Notice('调用AI时发生错误。');
        }
    }

    // 新增：处理消息重新生成
    async handleRegenerateMessage(aiMessageIndex) {
        // 验证索引的有效性
        if (aiMessageIndex < 0 || aiMessageIndex >= this.messages.length || this.messages[aiMessageIndex].role !== 'assistant') {
            new Notice('无法重新生成：无效的消息或索引。');
            console.error('RegenerateError: Invalid message index or role. Index:', aiMessageIndex, 'Messages count:', this.messages.length);
            if (this.messages[aiMessageIndex]) {
                console.error('Message role:', this.messages[aiMessageIndex].role);
            }
            return;
        }

        // 确保前一条消息是用户消息
        if (aiMessageIndex === 0 || this.messages[aiMessageIndex - 1].role !== 'user') {
            new Notice('无法重新生成此消息（之前没有用户消息或此为首条消息）。');
            console.error('RegenerateError: No preceding user message or it is the first message.');
            return;
        }

        const userMessageForPrompt = this.messages[aiMessageIndex - 1];

        // 1. 截断消息数组，保留到触发AI回复的用户消息（即AI消息的前一条）
        // 注意：aiMessageIndex 指向的是AI消息，所以slice(0, aiMessageIndex)会保留包括userMessageForPrompt在内的所有消息
        const messagesToKeep = this.messages.slice(0, aiMessageIndex); 
        this.messages = [...messagesToKeep];
        this.plugin.settings.chatHistory = [...this.messages];
        await this.plugin.saveSettings(); 

        // 2. 更新当前历史文件（如果存在）
        if (this.plugin.settings.currentHistoryFile) {
            const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.currentHistoryFile);
            if (file instanceof TFile) {
                const contentToSave = this.formatMessagesToMarkdown(this.messages); // 使用截断后的 this.messages
                await this.plugin.app.vault.modify(file, contentToSave);
            }
        }

        // 3. 更新UI - renderMessages会从chatHistory重建this.messages并渲染
        this.renderMessages(); 

        // 4. 清理输入状态并准备新的AI调用
        this.textarea.value = '';
        this.pendingImages = []; 
        this.imagePreviewArea.style.display = 'none';
        this.imagePreviewArea.empty();
        this.autoScroll = true; 

        // 5. 创建新的AI消息占位符并添加到UI，然后调用AI
        // createAssistantMessageElement 内部会添加到 this.messages 并返回DOM元素
        const newAssistantMessageEl = this.createAssistantMessageElement(); 
        this.scrollToBottom();

        try {
            // callAI 现在只接收 assistantMessageEl。 用户提示信息通过 this.messages 传递。
            await this.callAI(newAssistantMessageEl); 

            // 6. AI调用完成后，保存所有历史（包括新生成的回复）
            await this.saveTempChatHistory(); 

            if (this.plugin.settings.currentHistoryFile) {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.currentHistoryFile);
                if (file instanceof TFile) {
                    const finalContentToSave = this.formatMessagesToMarkdown(this.messages);
                    await this.plugin.app.vault.modify(file, finalContentToSave);
                    new Notice('历史记录已更新。');
                }
            }
            // chatHistory 应该在 callAI 内部的AI消息内容确定后，与 this.messages 同步
            // this.plugin.settings.chatHistory = [...this.messages]; // 确保chatHistory与this.messages同步
            await this.plugin.saveSettings(); 
            await this.updateDropdowns();

        } catch (error) {
            console.error('重新生成AI消息时发生错误:', error);
            await this.saveTempChatHistory();
            // this.plugin.settings.chatHistory = [...this.messages]; // 同步以保存错误占位符
            await this.plugin.saveSettings();
        }
    }
    
    // 新私有方法：创建单个消息的DOM元素
    _createMessageDomElement(messageData, messageIndex) {
        const { role, content, time, images } = messageData;

        const messageEl = this.messagesContainer.createDiv({ 
            cls: `chat-ai-message`,
            attr: {
                'data-role': role
            }
        });
        
        const contentContainer = messageEl.createDiv({ cls: 'message-content' });

        if (role === 'assistant') {
            // 对于助手消息，内容可能是Markdown，初始可能为空
            if (!content || content.trim() === '') {
                // 内容为空时，显示加载动画
                const loadingEl = contentContainer.createDiv({ cls: 'chat-ai-loading-animation' });
                loadingEl.innerHTML = '<div class="lds-ellipsis"><div></div><div></div><div></div><div></div></div>';
        } else {
                // 渲染完成后再绑定悬浮按钮，避免异步时序导致找不到 <img>
                const renderPromise = MarkdownRenderer.renderMarkdown(content, contentContainer, this.plugin.app.workspace.getActiveFile()?.path || '', this);
                if (renderPromise && typeof renderPromise.then === 'function') {
                    renderPromise.then(() => {
                        try { this.bindImageInteractions(contentContainer); } catch (_) {}
                    }).catch(() => {});
                } else {
                    try { setTimeout(() => this.bindImageInteractions(contentContainer), 0); } catch (_) {}
                }
            }
        } else { // 'user'
            contentContainer.setText(content);
            if (images && images.length > 0) {
                const imageContainer = messageEl.createDiv({
                    cls: 'message-images',
                    attr: { style: 'display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;' }
                });
                images.forEach(base64Image => {
                    const imgWrapper = imageContainer.createDiv({
                        cls: 'message-image-wrapper',
                        attr: { style: 'width: 200px; height: 200px; position: relative; cursor: pointer;' }
                    });
                    const img = imgWrapper.createEl('img', {
                        cls: 'message-image',
                        attr: {
                            src: `data:image/jpeg;base64,${base64Image}`,
                            style: 'width: 100%; height: 100%; object-fit: cover; border-radius: 4px;'
                        }
                    });
                    imgWrapper.addEventListener('click', () => {
                        new ImagePreviewModal(this.app, `data:image/jpeg;base64,${base64Image}`).open();
                    });
                });
            }
        }

        const bottomContainer = messageEl.createDiv({ cls: 'message-bottom' });
        bottomContainer.createDiv({
            cls: 'timestamp',
            text: time.toLocaleTimeString()
        });

        const copyBtn = bottomContainer.createEl('button', { cls: 'chat-ai-copy-button' });
        setIcon(copyBtn, 'copy');
        // 初始复制按钮，AI消息的复制功能会在callAI中被覆盖更新
        copyBtn.addEventListener('click', () => {
            const currentContent = role === 'assistant' ? this.messages[messageIndex]?.content : content;
            navigator.clipboard.writeText(this.cleanTextContent(currentContent || ''));
            new Notice('已复制到剪贴板');
        });

        if (role === 'user') { // Add edit button for user messages
            const editBtn = bottomContainer.createEl('button', { cls: 'chat-ai-edit-button' });
            setIcon(editBtn, 'pencil');
            editBtn.addEventListener('click', async () => {
                await this.handleEditUserMessage(messageIndex);
            });
        }

        if (role === 'assistant') {
            const refreshBtn = bottomContainer.createEl('button', { cls: 'chat-ai-refresh-button' });
            setIcon(refreshBtn, 'refresh-cw');
            refreshBtn.addEventListener('click', async () => {
                await this.handleRegenerateMessage(messageIndex);
            });
        }
        this.messagesContainer.appendChild(messageEl); // 直接添加到容器
        // return messageEl; // 不再返回，直接添加
    }

    addMessage(role, content, time = new Date(), save = true, images = []) {
        const messageData = { role, content, time, images };
        
        this.messages.push(messageData);
        const currentMessageIndex = this.messages.length - 1;

        if (save) {
            // chatHistory应与this.messages保持同步，尤其是在保存时
            this.plugin.settings.chatHistory.push({...messageData}); // 使用副本以防意外修改
            this.plugin.saveSettings();
        }
        
        this._createMessageDomElement(messageData, currentMessageIndex);
        // this.scrollToBottom(); // _createMessageDomElement 现在不返回，滚动应在此处或调用者处处理
    }

    scrollToBottom() {
        // 仅当 autoScroll 为 true 时才自动滚动，以尊重用户手动滚动的意图
        if (this.autoScroll) {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }
    }
    
    // 添加滚动到顶部的方法
    scrollToTop() {
        this.messagesContainer.scrollTop = 0;
    }
    
    // 创建滚动按钮
    createScrollButtons() {
        // 如果已经存在滚动按钮，则先移除
        const existingButtons = this.messagesContainer.querySelector('.chat-ai-scroll-buttons');
        if (existingButtons) {
            existingButtons.remove();
        }
        
        // 如果设置为不显示滚动按钮，则直接返回
        if (!this.plugin.settings.showScrollButtons) {
            return;
        }
        
        // 创建滚动按钮容器
        const scrollButtonsContainer = document.createElement('div');
        scrollButtonsContainer.className = 'chat-ai-scroll-buttons';
        
        // 应用自定义透明度
        const opacity = this.plugin.settings.scrollButtonsOpacity / 100;
        scrollButtonsContainer.style.setProperty('--scroll-buttons-opacity', opacity);
        
        // 创建滚动到顶部的按钮
        const scrollToTopButton = document.createElement('button');
        scrollToTopButton.className = 'chat-ai-scroll-button chat-ai-scroll-top-button';
        scrollToTopButton.setAttribute('aria-label', '滚动到顶部');
        scrollToTopButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
        
        // 创建滚动到底部的按钮
        const scrollToBottomButton = document.createElement('button');
        scrollToBottomButton.className = 'chat-ai-scroll-button chat-ai-scroll-bottom-button';
        scrollToBottomButton.setAttribute('aria-label', '滚动到底部');
        scrollToBottomButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
        
        // 添加点击事件，使用更直接的滚动方法
        scrollToTopButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.messagesContainer.scrollTop = 0;
        });
        
        scrollToBottomButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
        
        // 将按钮添加到容器中
        scrollButtonsContainer.appendChild(scrollToTopButton);
        scrollButtonsContainer.appendChild(scrollToBottomButton);
        
        // 将容器添加到消息容器中
        this.messagesContainer.appendChild(scrollButtonsContainer);
        
        // 移除滚动事件监听器，防止重复添加
        if (this.scrollEventListener) {
            this.messagesContainer.removeEventListener('scroll', this.scrollEventListener);
        }
        
        // 创建新的滚动事件监听器
        this.scrollEventListener = () => {
            // 如果已经有定时器，先清除
            if (this.scrollButtonsTimeout) {
                clearTimeout(this.scrollButtonsTimeout);
                this.scrollButtonsTimeout = null;
            }
            
            // 当滚动时，增加按钮的不透明度
            scrollButtonsContainer.classList.add('chat-ai-scroll-buttons-active');
        };
        
        // 添加滚动事件监听
        this.messagesContainer.addEventListener('scroll', this.scrollEventListener);
        
        // 添加鼠标进入/离开事件
        scrollButtonsContainer.addEventListener('mouseenter', () => {
            // 鼠标悬停时，保持按钮可见并增加不透明度
            scrollButtonsContainer.classList.add('chat-ai-scroll-buttons-hover');
            
            // 清除可能存在的隐藏定时器
            if (this.scrollButtonsTimeout) {
                clearTimeout(this.scrollButtonsTimeout);
                this.scrollButtonsTimeout = null;
            }
        });
        
        scrollButtonsContainer.addEventListener('mouseleave', () => {
            // 鼠标离开时，恢复默认不透明度
            scrollButtonsContainer.classList.remove('chat-ai-scroll-buttons-hover');
        });
    }

    async callAI(assistantMessageEl, attempt = 1) {
        try {
            let apiKey = this.plugin.settings.currentApiKey || this.plugin.settings.apiKey[0] || '';
            const parsedKey = getKeyValueFromEntry(apiKey);
            if (parsedKey) {
                apiKey = parsedKey;
            }

            let baseUrl = (this.plugin.settings.currentBaseUrl || '').trim();
            const urlMatch = baseUrl.match(/(.*?)(https?:\/\/\S+)/);
            if (urlMatch) {
                baseUrl = urlMatch[2];
            }
            const normalizedBaseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';
            const baseForCompletion = normalizedBaseUrl || baseUrl;
            const hasAdditionalPathSegments = (url) => {
                if (!url) return false;
                const doubleSlashIndex = url.indexOf('//');
                const rightSide = doubleSlashIndex >= 0 ? url.slice(doubleSlashIndex + 2) : url;
                const slashMatches = rightSide ? rightSide.match(/\//g) : null;
                return slashMatches ? slashMatches.length > 1 : false;
            };
            const skipUrlAutoCompletion = hasAdditionalPathSegments(normalizedBaseUrl);
            const requestApiUrl = (() => {
                if (!baseForCompletion) {
                    return '';
                }
                if (skipUrlAutoCompletion) {
                    return baseUrl || baseForCompletion;
                }
                if (baseForCompletion.endsWith('/v1') || baseForCompletion.includes('/v1/')) {
                    return `${baseForCompletion}/chat/completions`;
                }
                return `${baseForCompletion}/v1/chat/completions`;
            })();

            // 在构建消息前，重新读取当前的 System Message 文件内容
            if (this.plugin.settings.currentSystemMessageFile) {
                const filePath = `${this.plugin.settings.systemMessagePath}/${this.plugin.settings.currentSystemMessageFile}`;
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    const content = await this.plugin.app.vault.read(file);
                    this.plugin.settings.currentSystemMessage = content;
                }
            }

            // 构建发送给API的消息列表
            const apiPayloadMessages = [];
            if (this.plugin.settings.currentSystemMessage) {
                apiPayloadMessages.push({
                    role: 'system',
                    content: this.plugin.settings.currentSystemMessage
                });
            }
            
            // 使用 this.messages 中除了最后一个（AI占位符）之外的所有消息作为历史记录
            const effectiveHistory = this.messages.slice(0, -1);
            for (const m of effectiveHistory) {
                if (!m.content && (!m.images || m.images.length === 0)) {
                    continue;
                }
                if (m.role === 'user' && m.images && m.images.length > 0) {
                    const contentForApi = [];
                    if (m.content) {
                        contentForApi.push({
                            type: "text",
                            text: m.content
                        });
                    }
                    m.images.forEach(base64Image => {
                        contentForApi.push({
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        });
                    });
                    apiPayloadMessages.push({
                        role: m.role,
                        content: contentForApi
                    });
                } else if (m.content) {
                    apiPayloadMessages.push({
                        role: m.role,
                        content: m.content
                    });
                }
            }
            // userMessage 和 historicalUserImages 参数现在实际上已经被 effectiveHistory 的最后一条消息所包含
            // 因此，apiPayloadMessages 已经构建完毕

            // 直接使用面板中的流式控件状态
            let useStreaming = this.plugin.settings.useStreaming;
            
            // 根据是否使用代理选择不同的请求方式
            if (this.plugin.settings.useProxy) {
                // 使用代理
                const proxyData = {
                    apiUrl: requestApiUrl,
                    apiKey: apiKey,
                    model: this.plugin.settings.currentModel,
                    messages: apiPayloadMessages, // 使用构建好的 apiPayloadMessages
                    stream: useStreaming, // 使用面板中的流式控件状态
                    temperature: this.plugin.settings.temperature,
                    max_tokens: this.plugin.settings.maxTokens // 添加最大补全长度参数
                };

                if (this.plugin.settings.logRequestParams) {
                    console.log('请求参数:', proxyData);
                }

                const response = await fetch(this.plugin.settings.proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(proxyData)
                });

                if (!response.ok) {
                    throw new Error(`代理请求失败: ${response.status} - ${response.statusText}`);
                }

                const contentContainer = assistantMessageEl.querySelector('.message-content');
                let accumulatedContent = '';

                if (useStreaming) {
                    // 流式处理
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.trim() === '') continue;
                            if (line.trim() === 'data: [DONE]') continue;
                            
                            try {
                                const jsonStr = line.replace(/^data: /, '');
                                const json = JSON.parse(jsonStr);
                                
                                // 添加更多的空值检查
                                if (json && json.choices && json.choices[0] && json.choices[0].delta) {
                                    const content = json.choices[0].delta.content || '';
                                    
                                    if (content) {
                                        accumulatedContent += content;
                                        
                                        contentContainer.empty(); // 清空容器，移除加载动画或旧内容
                                        await MarkdownRenderer.renderMarkdown(
                                            accumulatedContent,
                                            contentContainer,
                                            this.plugin.app.workspace.getActiveFile()?.path || '',
                                            this
                                        );
                                        
                                        // 只有在autoScroll为true时才滚动到底部，尊重用户的滚动意图
                                        if (this.autoScroll) {
                                            this.scrollToBottom();
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('解析流数据时出错:', e);
                                // 继续处理下一行数据，不中断整个过程
                                continue;
                            }
                        }
                    }
                } else {
                    // 非流式处理
                    const responseData = await response.json();
                    accumulatedContent = responseData.choices[0]?.message?.content || '';
                    
                    // 直接渲染完整内容
                    contentContainer.empty(); // 清空容器，移除加载动画
                    await MarkdownRenderer.renderMarkdown(
                        accumulatedContent,
                        contentContainer,
                        this.plugin.app.workspace.getActiveFile()?.path || '',
                        this
                    );
                    if (this.autoScroll) {
                        this.scrollToBottom();
                        setTimeout(() => {
                            if (this.autoScroll) {
                                this.scrollToBottom();
                            }
                        }, 0);
                    }
                }

                // 保存图片并替换内容为内部链接
                const processedContentProxy = await this.postProcessAssistantImages(assistantMessageEl, accumulatedContent);

                // 更新消息数组中的内容
                const lastMessage = this.messages[this.messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = processedContentProxy;
                    // 同步最新聊天历史，防止气泡丢失
                    this.plugin.settings.chatHistory = [...this.messages];
                    await this.plugin.saveSettings(true); // 跳过视图更新，避免DOM重新渲染导致滚动跳转
                }

                // 设置复制按钮事件（基于处理后的文本）
                const copyBtn = assistantMessageEl.querySelector('.chat-ai-copy-button');
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(this.cleanTextContent(processedContentProxy));
                    new Notice('已复制到剪贴板');
                };

            } else {
                // 原有的直接请求方式
                const requestData = {
                    model: this.plugin.settings.currentModel,
                    messages: apiPayloadMessages, // 使用构建好的 apiPayloadMessages
                    stream: useStreaming, // 使用面板中的流式控件状态
                    temperature: this.plugin.settings.temperature,
                    max_tokens: this.plugin.settings.maxTokens // 添加最大补全长度参数
                };

                if (this.plugin.settings.logRequestParams) {
                    console.log('请求参数:', requestData);
                }

                const response = await fetch(requestApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(requestData)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API请求失败: ${response.status} - ${response.statusText}\n${errorText}`);
                }

                const contentContainer = assistantMessageEl.querySelector('.message-content');
                let accumulatedContent = '';

                if (useStreaming) {
                    // 流式处理
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value);
                        const lines = chunk.split('\n');
                        
                        for (const line of lines) {
                            if (line.trim() === '') continue;
                            if (line.trim() === 'data: [DONE]') continue;
                            
                            try {
                                const jsonStr = line.replace(/^data: /, '');
                                const json = JSON.parse(jsonStr);
                                const content = json.choices[0]?.delta?.content || '';
                                
                                if (content) {
                                    accumulatedContent += content;
                                    
                                    contentContainer.empty(); // 清空容器，移除加载动画或旧内容
                                    await MarkdownRenderer.renderMarkdown(
                                        accumulatedContent,
                                        contentContainer,
                                        this.plugin.app.workspace.getActiveFile()?.path || '',
                                        this
                                    );
                                    
                                    // 只有在autoScroll为true时才滚动到底部，尊重用户的滚动意图
                                    if (this.autoScroll) {
                                        this.scrollToBottom();
                                    }
                                }
                            } catch (e) {
                                console.warn('解析流数据时出错:', e);
                            }
                        }
                    }
                } else {
                    // 非流式处理
                    const responseData = await response.json();
                    accumulatedContent = responseData.choices[0]?.message?.content || '';
                    
                    // 直接渲染完整内容
                    contentContainer.empty(); // 清空容器，移除加载动画
                    await MarkdownRenderer.renderMarkdown(
                        accumulatedContent,
                        contentContainer,
                        this.plugin.app.workspace.getActiveFile()?.path || '',
                        this
                    );
                    if (this.autoScroll) {
                        this.scrollToBottom();
                        setTimeout(() => {
                            if (this.autoScroll) {
                                this.scrollToBottom();
                            }
                        }, 0);
                    }
                }

                // 保存图片并替换内容为内部链接
                const processedContent = await this.postProcessAssistantImages(assistantMessageEl, accumulatedContent);

                // 更新消息数组中的内容
                const lastMessage = this.messages[this.messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = processedContent;
                    // 同步最新聊天历史，防止气泡丢失
                    this.plugin.settings.chatHistory = [...this.messages];
                    await this.plugin.saveSettings(true); // 跳过视图更新，避免DOM重新渲染导致滚动跳转
                }

                // 设置复制按钮事件（基于处理后的文本）
                const copyBtn = assistantMessageEl.querySelector('.chat-ai-copy-button');
                copyBtn.onclick = () => {
                    navigator.clipboard.writeText(this.cleanTextContent(processedContent));
                    new Notice('已复制到剪贴板');
                };
            }

        } catch (error) {
            const maxRetries = this.plugin.settings.maxRetryAttempts ?? 0;
            console.error(`callAI 第 ${attempt} 次尝试失败:`, error);

            // 如果还未达到最大重试次数，则等待后重试
            if (attempt <= maxRetries) {
                console.log(`将在 1 秒后进行第 ${attempt + 1} 次重试 (最多 ${maxRetries} 次重试)`);
                // 等待 1 秒再重试，防止瞬时错误反复出现
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.callAI(assistantMessageEl, attempt + 1);
            } else {
                // 超出重试次数后，给出提示并抛出错误
                new Notice('AI 请求失败，已达到最大重试次数');

                // 如果可能，更新界面提示错误
                if (assistantMessageEl && assistantMessageEl.querySelector) {
                    const contentContainer = assistantMessageEl.querySelector('.message-content');
                    if (contentContainer) {
                        contentContainer.empty();
                        contentContainer.setText(`请求失败: ${error.message}`);
                    }
                }

                throw error;
            }
        } finally {
            // 无论成功还是失败，都重置AI回复状态
            this.isReceivingResponse = false;
        }
    }

    async onClose() {
        // 移除主题观察器
        if (this.themeObserver) {
            this.themeObserver.disconnect();
        }
        
        // 移除历史记录文件监听器
        if (this.historyFileWatcher) {
            this.app.vault.off('create', this.historyFileWatcher.createHandler);
            this.app.vault.off('delete', this.historyFileWatcher.deleteHandler);
            this.app.vault.off('modify', this.historyFileWatcher.modifyHandler);
            this.app.vault.off('rename', this.historyFileWatcher.renameHandler);
        }
        
        // 其他清理代码...
        this.containerEl.removeEventListener('wheel', this.handleWheel);

        // 移除文件监听器
        if (this.systemMessageWatcher) {
            this.app.vault.offref(this.systemMessageWatcher);
        }

        // 移除图片观察器
        if (this.imageMutationObserver) {
            this.imageMutationObserver.disconnect();
            this.imageMutationObserver = null;
        }
    }

    async updateDropdowns() {
        // 安全检查：确保rightPanel存在
        if (!this.rightPanel) {
            return;
        }

        // 更新下拉菜单的选中状态
        const baseUrlSelect = this.rightPanel.querySelector('.chat-ai-dropdown:nth-child(1)');
        const apiKeySelect = this.rightPanel.querySelector('.chat-ai-dropdown:nth-child(2)');
        const modelSelect = this.rightPanel.querySelector('.chat-ai-dropdown:nth-child(3)');

        if (baseUrlSelect) {
            Array.from(baseUrlSelect.options).forEach(option => {
                if (option.value === this.plugin.settings.currentBaseUrl) {
                    option.selected = true;
                }
            });
        }

        if (apiKeySelect) {
            Array.from(apiKeySelect.options).forEach(option => {
                if (option.value === this.plugin.settings.currentApiKey) {
                    option.selected = true;
                }
            });
        }

        if (modelSelect) {
            Array.from(modelSelect.options).forEach(option => {
                if (option.value === this.plugin.settings.currentModel) {
                    option.selected = true;
                }
            });
        }
        
        // 更新代理按钮文本
        const proxyToggle = this.rightPanel.querySelector('.proxy-toggle');
        if (proxyToggle) {
            proxyToggle.textContent = this.plugin.settings.useProxy ? '代理已开启' : '代理已关闭';
        }
    }

    // 监听主题变化
    registerThemeObserver() {
        // 创建观察器实例
        const observer = new MutationObserver(() => {
            // 当主题改变时，更新所有助手消息的样式
            const assistantMessages = this.containerEl.querySelectorAll('.chat-ai-message.assistant');
            assistantMessages.forEach(msg => {
                msg.style.background = getComputedStyle(document.body).getPropertyValue('--background-modifier-form-field');
                msg.style.color = getComputedStyle(document.body).getPropertyValue('--text-normal');
            });
        });

        // 始观察 body 的 class 变化
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });

        // 保存观察器实例以便后续清理
        this.themeObserver = observer;
    }

    // 新增：加载聊天历史
    async loadChatHistory() {
        console.log('开始加载聊天历史');
        try {
            const tempFile = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.tempHistoryFile);
            if (tempFile instanceof TFile) {
                const content = await this.plugin.app.vault.read(tempFile);
                if (content.trim() === '') {
                    console.log('临时文件为空，不加载历史记录');
                    // 即使是空历史记录，也应该渲染并滚动到底部
                    this.plugin.settings.chatHistory = [];
                    this.renderMessages(false); // 总是滚动到底部
                    return;
                }
                console.log('找到临时文件');
                this.plugin.settings.chatHistory = this.plugin.parseMarkdownToChatHistory(content);
                console.log('已加载聊天历史，消息数量:', this.plugin.settings.chatHistory.length);
                
                // 打开面板时总是滚动到底部，不考虑autoScrollAfterHistorySwitch设置
                this.renderMessages(false);
                
                return;
            }
        } catch (error) {
            console.error('加载临时对话文件时出错:', error);
        }

        // 如果临时文件不存在或加载失败，创建空的临时文件
        try {
            console.log('创建新的临时文件');
            await this.ensureHistoryFolder();
            await this.plugin.app.vault.create(this.plugin.settings.tempHistoryFile, '');
            this.plugin.settings.chatHistory = [];
            this.renderMessages(false); // 对于新创建的空历史，总是滚动到底部
            console.log('临时文件已创建');
        } catch (error) {
            console.error('创建临时对话文件时出错:', error);
        }
    }

    // 新增：解析Markdown内容到chatHistory
    parseMarkdownToChatHistory(content) {
        const lines = content.split('\n');
        const chatHistory = [];
        let currentRole = null;
        let currentTime = null;
        let currentContent = [];

        lines.forEach(line => {
            const roleMatch = line.match(/^###\s*(你|AI)\s*\((\d{1,2}:\d{2}:\d{2})\)/);
            if (roleMatch) {
                // 保存之前的消息
                if (currentRole && currentContent.length > 0) {
                    chatHistory.push({
                        role: currentRole === '你' ? 'user' : 'assistant',
                        content: currentContent.join('\n'),
                        time: new Date(`1970-01-01T${currentTime}Z`) // 使用UTC时间
                    });
                }
                // 开始新的消息
                currentRole = roleMatch[1];
                currentTime = roleMatch[2];
                currentContent = [];
            } else {
                if (currentRole) {
                    currentContent.push(line);
                }
            }
        });

        // 保存最后一条消息
        if (currentRole && currentContent.length > 0) {
            chatHistory.push({
                role: currentRole === '你' ? 'user' : 'assistant',
                content: currentContent.join('\n'),
                time: new Date(`1970-01-01T${currentTime}Z`)
            });
        }

        return chatHistory;
    }

    // 新增：将chatHistory渲染到界面
    renderMessages(skipScroll = false) {
        console.log('开始渲染消息');

        // 检查是否正在接收AI回复，如果是则跳过重新渲染以避免气泡消失
        if (this.isReceivingResponse) {
            console.log('正在接收AI回复，跳过消息重新渲染');
            return;
        }

        this.messagesContainer.empty();
        this.messages = [...this.plugin.settings.chatHistory]; // 从chatHistory同步this.messages
        console.log('要渲染的消息数量:', this.messages.length);
        this.messages.forEach((msgData, index) => {
            this._createMessageDomElement(msgData, index); // 使用新的私有方法渲染，它会直接appendChild
        });
        
        // 只有在不跳过滚动的情况下才滚动到底部
        if (!skipScroll) {
            this.scrollToBottom(); // 确保渲染后滚动到底部
        }
        
        // 重新创建滚动按钮
        this.createScrollButtons();
        
        // 历史渲染完成后重新为全部图片绑定悬浮操作（防止用户移除过某些绑定）
        try { this.bindImageInteractions(this.messagesContainer); } catch (_) {}

        // 监听图片后续的 DOM 变动（比如延迟渲染/图片懒加载等），自动补绑
        try {
            if (this.imageMutationObserver) {
                this.imageMutationObserver.disconnect();
            }
            this.imageMutationObserver = new MutationObserver(() => {
                try { this.bindImageInteractions(this.messagesContainer); } catch (_) {}
            });
            this.imageMutationObserver.observe(this.messagesContainer, { childList: true, subtree: true });
        } catch (_) {}

        console.log('消息渲染完成');
    }

    // 新增：将chatHistory保存为Markdown文件
    async saveChatHistoryToFile(chatHistory) {
        const historyFolderPath = 'A重要文件/ai历史记录';
        let folder = this.plugin.app.vault.getAbstractFileByPath(historyFolderPath);
        if (!(folder instanceof TFolder)) {
            // 创建文件夹
            folder = await this.plugin.app.vault.createFolder(historyFolderPath);
        }

        // 生成时间戳
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0];
        const filename = `${timestamp}.md`;
        const filePath = `${historyFolderPath}/${filename}`;

        // 格式化内容为Markdown
        let content = '';
        chatHistory.forEach(msg => {
            let timeStr = 'Time N/A'; // 默认时间占位符
            if (msg.time) { // 检查 msg.time 是否存在
                try {
                    // 尝试将 msg.time 转换为 Date 对象（如果它还不是）
                    const dateObject = msg.time instanceof Date ? msg.time : new Date(msg.time);
                    
                    // 检查转换后的对象是否是有效的 Date
                    if (dateObject instanceof Date && !isNaN(dateObject.getTime())) {
                        timeStr = dateObject.toLocaleTimeString(); 
                    } else {
                        console.warn("保存历史记录时遇到无效的时间格式:", msg.time);
                        // 如果原始值是字符串，可以考虑显示原始字符串
                        if (typeof msg.time === 'string') {
                           timeStr = `Invalid (${msg.time})`;
                        }
                    }
                } catch (e) {
                     console.error("处理消息时间时出错:", msg.time, e);
                     if (typeof msg.time === 'string') {
                           timeStr = `Error (${msg.time})`;
                     } else {
                           timeStr = '处理时间出错';
                     }
                }
            }
             const speaker = msg.role === 'user' ? '你' : 'AI';
            content += `### ${speaker} (${timeStr})\n\n${msg.content}\n\n`;
        });

        // 创建并写入文件
        await this.plugin.app.vault.create(filePath, content);

        // 更新当前历史文件路径
        this.plugin.settings.currentHistoryFile = filePath;
        await this.plugin.saveSettings();
    }

    // 新增：更新设置
    async updateSettings() {
        // 更新下拉菜单的值
        const baseUrlSelect = this.containerEl.querySelector('.header-dropdowns select:nth-child(1)');
        const apiKeySelect = this.containerEl.querySelector('.header-dropdowns select:nth-child(2)');
        const modelSelect = this.containerEl.querySelector('.header-dropdowns select:nth-child(3)');

        if (baseUrlSelect) {
            baseUrlSelect.value = this.plugin.settings.currentBaseUrl;
        }
        if (apiKeySelect) {
            apiKeySelect.value = this.plugin.settings.currentApiKey;
        }
        if (modelSelect) {
            modelSelect.value = this.plugin.settings.currentModel;
        }
        
        // 更新滚动按钮
        this.createScrollButtons();

        // 仅更新下拉菜单内容，而不重建整个UI
        await this.updateDropdowns();
        
        // 更新紧凑配置视图
        this.applyCompactConfigView();

        // 更新消息内容
        this.renderMessages();
    }

    // 添加保存临时对话的方法
    async saveTempChatHistory() {
        const content = this.formatMessagesToMarkdown(this.messages);
        try {
            const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.tempHistoryFile);
            if (file instanceof TFile) {
                await this.plugin.app.vault.modify(file, content);
            } else {
                await this.plugin.app.vault.create(this.plugin.settings.tempHistoryFile, content);
            }
        } catch (error) {
            console.error('保存临时对话时出错:', error);
        }
    }

    // 添加格式化消息的方法
    formatMessagesToMarkdown(messages) {
        return messages.map(msg => {
            const timeStr = msg.time.toLocaleTimeString();
            const speaker = msg.role === 'user' ? '你' : 'AI';
            return `### ${speaker} (${timeStr})\n\n${msg.content}\n\n`;
        }).join('');
    }

    // 添加创建助手消息元素的方法
    createAssistantMessageElement() {
        const assistantMessageData = {
            role: 'assistant', 
            content: '', // 内容初始为空，由 callAI 填充
            time: new Date() 
        };
        this.messages.push(assistantMessageData); // 将占位符添加到 this.messages
        const assistantMessageIndex = this.messages.length - 1;

        // 使用 _createMessageDomElement 创建并添加 DOM 元素
        // _createMessageDomElement 会自动将元素添加到 this.messagesContainer
        this._createMessageDomElement(assistantMessageData, assistantMessageIndex);

        // 返回新创建的 DOM 元素中用于填充内容的部分，或整个消息元素
        // 需要找到刚刚通过 _createMessageDomElement 添加的最后一个元素
        const messageElements = this.messagesContainer.children;
        return messageElements[messageElements.length - 1]; // 返回刚添加的消息气泡元素
    }

    // 添加图片上传相关方法
    initializeImageUpload() {
        // 创建隐藏的文件输入元素
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.multiple = true;
        this.fileInput.style.display = 'none';
        this.containerEl.appendChild(this.fileInput);

        // 初始化待发送的图片数组
        this.pendingImages = [];

        // 添加文件选择事件监听
        this.fileInput.addEventListener('change', async () => {
            const files = Array.from(this.fileInput.files);
            for (const file of files) {
                try {
                    const base64Image = await this.handleImageUpload(file);
                    this.pendingImages.push(base64Image);
                    this.addImagePreview(base64Image);
                } catch (error) {
                    new Notice(`上传图片失败: ${error.message}`);
                }
            }
            // 重置文件输入框的值，这样可以重复选择相同的文件
            this.fileInput.value = '';
        });

        // 添加粘贴事件监听
        this.textarea.addEventListener('paste', async (e) => {
            const items = Array.from(e.clipboardData.items);
            const imageItems = items.filter(item => item.type.startsWith('image/'));
            
            if (imageItems.length > 0) {
                e.preventDefault(); // 阻止默认粘贴行为
                
                for (const item of imageItems) {
                    const file = item.getAsFile();
                    try {
                        const base64Image = await this.handleImageUpload(file);
                        this.pendingImages.push(base64Image);
                        this.addImagePreview(base64Image);
                        // new Notice('图片已添加到候选区');
                    } catch (error) {
                        new Notice(`处理粘贴的图片失败: ${error.message}`);
                    }
                }
            }
        });

        // 添加拖放支持
        this.textarea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.textarea.style.borderColor = 'var(--interactive-accent)';
            this.textarea.style.borderStyle = 'dashed';
            this.textarea.style.borderWidth = '2px';
        });

        this.textarea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 恢复到CSS定义的默认状态
            this.textarea.style.removeProperty('border-color');
            this.textarea.style.removeProperty('border-style');
            this.textarea.style.removeProperty('border-width');
        });

        this.textarea.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // 恢复到CSS定义的默认状态
            this.textarea.style.removeProperty('border-color');
            this.textarea.style.removeProperty('border-style');
            this.textarea.style.removeProperty('border-width');

            const items = Array.from(e.dataTransfer.items);
            const files = Array.from(e.dataTransfer.files);
            
            // 处理拖放的文件
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    try {
                        const base64Image = await this.handleImageUpload(file);
                        this.pendingImages.push(base64Image);
                        this.addImagePreview(base64Image);
                        new Notice('图片已添加到候选区');
                    } catch (error) {
                        new Notice(`处理拖放的图片失败: ${error.message}`);
                    }
                }
            }
        });
    }

    // 初始化拖拽调节输入框高度功能
    initializeDragResize(dragHandle, inputArea) {
        let isDragging = false;
        let startY = 0;
        let startHeight = 0;

        // 鼠标按下事件
        const handleMouseDown = (e) => {
            isDragging = true;
            startY = e.clientY || e.touches[0].clientY;
            startHeight = inputArea.offsetHeight;

            // 防止选中文本和事件冒泡
            e.preventDefault();
            e.stopPropagation();

            // 设置拖拽状态的样式
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ns-resize';
            dragHandle.style.backgroundColor = 'var(--interactive-accent)';
            dragHandle.style.opacity = '0.2';
        };

        // 鼠标移动事件
        const handleMouseMove = (e) => {
            if (!isDragging) return;

            const currentY = e.clientY || e.touches[0].clientY;
            const deltaY = currentY - startY;
            const newHeight = Math.max(80, Math.min(400, startHeight - deltaY)); // 修正：使用减法，向下拖拽增加高度

            // 设置新高度，使用!important确保覆盖CSS规则
            inputArea.style.setProperty('height', newHeight + 'px', 'important');
            inputArea.style.setProperty('min-height', newHeight + 'px', 'important');
            inputArea.style.setProperty('max-height', newHeight + 'px', 'important');
            inputArea.style.setProperty('flex', `0 0 ${newHeight}px`, 'important');

            // 如果存在textarea，也需要调整其高度
            if (this.textarea) {
                const textareaHeight = Math.max(40, newHeight - 60); // 最小40px，最大根据输入区域高度计算
                this.textarea.style.setProperty('max-height', textareaHeight + 'px', 'important');
                this.textarea.style.setProperty('min-height', textareaHeight + 'px', 'important');
                this.textarea.style.setProperty('height', textareaHeight + 'px', 'important');
            }
        };

        // 鼠标释放事件
        const handleMouseUp = () => {
            if (isDragging) {
                isDragging = false;

                // 恢复样式
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                // 移除拖拽时的背景色，让CSS处理悬停效果
                dragHandle.style.removeProperty('background-color');
                dragHandle.style.removeProperty('opacity');

                // 保存当前高度到设置
                const currentHeight = parseInt(inputArea.style.height);
                if (currentHeight && currentHeight >= 80 && currentHeight <= 400) {
                    // 保存到插件的设置中
                    if (this.plugin && this.plugin.settings) {
                        this.plugin.settings.inputAreaHeight = currentHeight;
                        this.plugin.saveSettings();
                    }
                }
            }
        };

        // 绑定事件
        dragHandle.addEventListener('mousedown', handleMouseDown);
        dragHandle.addEventListener('touchstart', handleMouseDown);

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('touchmove', handleMouseMove);

        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchend', handleMouseUp);

        // 存储事件处理器引用以便清理
        dragHandle._cleanup = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('touchmove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchend', handleMouseUp);
        };
    }

    // 处理图片上传
    async handleImageUpload(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // 获取base64字符串，移除开头的 "data:image/jpeg;base64," 等前缀
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    }

    // 修改 addImagePreview 方法
    addImagePreview(base64Image) {
        // 确保预览区域可见并设置样式
        this.imagePreviewArea.style.display = 'flex';
        this.imagePreviewArea.style.flexWrap = 'wrap';
        this.imagePreviewArea.style.gap = '8px';
        this.imagePreviewArea.style.padding = '8px';
        this.imagePreviewArea.style.background = 'transparent';
        
        const previewContainer = this.imagePreviewArea.createDiv({
            cls: 'image-preview-container',
            attr: {
                style: 'position: relative; width: 100px; height: 100px; margin: 4px; background: transparent;'
            }
        });

        const img = previewContainer.createEl('img', {
            attr: {
                src: `data:image/jpeg;base64,${base64Image}`,
                style: 'width: 100%; height: 100%; object-fit: cover; border-radius: 4px; cursor: pointer;'
            }
        });

        // 添加点击事件
        img.addEventListener('click', () => {
            new ImagePreviewModal(this.app, `data:image/jpeg;base64,${base64Image}`).open();
        });

        const removeButton = previewContainer.createEl('button', {
            cls: 'remove-image-button',
            attr: {
                style: 'position: absolute; top: -8px; right: -8px; background: var(--background-modifier-error); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center;'
            }
        });
        setIcon(removeButton, 'x');

        removeButton.addEventListener('click', () => {
            const index = this.pendingImages.indexOf(base64Image);
            if (index > -1) {
                this.pendingImages.splice(index, 1);
                previewContainer.remove();
                
                // 如果没有更多图片，完全隐藏预览区域并重置其内容
                if (this.pendingImages.length === 0) {
                    this.imagePreviewArea.style.display = 'none';
                    this.imagePreviewArea.empty(); // 清空预览区域的内容
                }
            }
        });
    }

    // 将 AI 返回内容中的 data:image/base64 图片保存到附件目录并替换为内部链接
    async postProcessAssistantImages(assistantMessageEl, originalContent) {
        try {
            if (!originalContent || typeof originalContent !== 'string') {
                return originalContent || '';
            }

            // 提取所有 data:image/base64 资源（Markdown、HTML 与纯文本形式）
            const markdownImgRegex = /!\[[^\]]*\]\((data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\)/g;
            const htmlImgRegex = /<img[^>]*src=["'](data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)["'][^>]*>/g;
            const plainDataUrlRegex = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g;
            const wikiEmbedRegex = /!\[\[([^\]]+)\]\]/g;

            const dataUrlToSavedPath = new Map();
            const dataUrlToResource = new Map();

            // 收集唯一的 dataURL
            const collectMatches = (regex, text) => {
                const results = new Set();
                regex.lastIndex = 0;
                let m;
                while ((m = regex.exec(text)) !== null) {
                    results.add(m[1]);
                }
                return Array.from(results);
            };

            const markdownUrls = collectMatches(markdownImgRegex, originalContent);
            const htmlUrls = collectMatches(htmlImgRegex, originalContent);
            const plainUrls = collectMatches(plainDataUrlRegex, originalContent);
            const allDataUrls = Array.from(new Set([...markdownUrls, ...htmlUrls, ...plainUrls]));

            for (let i = 0; i < allDataUrls.length; i++) {
                const dataUrl = allDataUrls[i];
                try {
                    const { mime, arrayBuffer, ext } = await this.dataUrlToArrayBuffer(dataUrl);
                    const fileName = await this.generateImageFileName(ext);
                    const targetPath = await this.getAttachmentSavePath(fileName);
                    const finalPath = await this.writeBinaryEnsuringUnique(targetPath, arrayBuffer);
                    dataUrlToSavedPath.set(dataUrl, finalPath);
                    const file = this.app.vault.getAbstractFileByPath(finalPath);
                    const resource = file ? this.app.vault.getResourcePath(file) : finalPath;
                    dataUrlToResource.set(dataUrl, resource);
                } catch (e) {
                    console.warn('保存图片失败，已跳过该图片:', e);
                }
            }

            // 没有可替换的图片
            if (dataUrlToSavedPath.size === 0) {
                // 也绑定交互，涵盖非 base64 的图片
                const contentContainer = assistantMessageEl.querySelector('.message-content');
                if (contentContainer) {
                    this.bindImageInteractions(contentContainer);
                }
                return originalContent;
            }

            // 构建替换：将 dataURL 转换为 <img src="resource">
            let processed = originalContent.replace(markdownImgRegex, (full, dataUrl) => {
                const resource = dataUrlToResource.get(dataUrl);
                if (!resource) return full;
                return `<img src="${resource}" alt="" />`;
            });

            processed = processed.replace(htmlImgRegex, (full, dataUrl) => {
                const resource = dataUrlToResource.get(dataUrl);
                if (!resource) return full;
                return `<img src="${resource}" alt="" />`;
            });

            processed = processed.replace(plainDataUrlRegex, (full) => {
                const resource = dataUrlToResource.get(full);
                if (!resource) return full;
                return `<img src="${resource}" alt="" />`;
            });

            // 兼容：将 ![[path]] 转换为 <img src="resource">，避免 wiki 嵌入在此上下文无法解析
            processed = processed.replace(wikiEmbedRegex, (full, path) => {
                const file = this.app.vault.getAbstractFileByPath(path);
                const resource = file ? this.app.vault.getResourcePath(file) : path;
                return `<img src="${resource}" alt="" />`;
            });

            // 使用替换后的内容重新渲染，并绑定交互
            const contentContainer = assistantMessageEl.querySelector('.message-content');
            if (contentContainer) {
                contentContainer.empty();
                await MarkdownRenderer.renderMarkdown(
                    processed,
                    contentContainer,
                    this.plugin.app.workspace.getActiveFile()?.path || '',
                    this
                );
                this.bindImageInteractions(contentContainer);
            }

            return processed;
        } catch (err) {
            console.error('postProcessAssistantImages 出错:', err);
            return originalContent;
        }
    }

    // 将 data:image/base64 转换为 ArrayBuffer，并推断扩展名
    async dataUrlToArrayBuffer(dataUrl) {
        if (!dataUrl.startsWith('data:')) {
            throw new Error('不是 data URL');
        }
        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
        if (!match) {
            throw new Error('不支持的 data URL 格式');
        }
        const mime = match[1];
        const base64 = match[2];
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const ext = this.mimeToExtension(mime);
        return { mime, arrayBuffer: bytes.buffer, ext };
    }

    mimeToExtension(mime) {
        try {
            const subtype = mime.split('/')[1] || 'png';
            if (subtype === 'jpeg') return 'jpg';
            if (subtype === 'svg+xml') return 'svg';
            return subtype;
        } catch (_) {
            return 'png';
        }
    }

    async generateImageFileName(ext) {
        const now = new Date();
        const ts = now.toISOString().replace(/[:.]/g, '-');
        const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
        return `ai-image-${ts}-${rand}.${ext || 'png'}`;
    }

    async getAttachmentSavePath(fileName) {
        try {
            const activePath = this.plugin.app.workspace.getActiveFile()?.path || '';
            if (this.app.fileManager && this.app.fileManager.getAvailablePathForAttachment) {
                const path = this.app.fileManager.getAvailablePathForAttachment(fileName, activePath);
                // 确保文件夹存在
                const folder = path.substring(0, path.lastIndexOf('/'));
                if (folder && !this.app.vault.getAbstractFileByPath(folder)) {
                    await this.ensureFolder(folder);
                }
                return path;
            }

            // 兜底：根据配置 attachmentFolderPath 决定目录
            let folderPath = this.app.vault.getConfig ? (this.app.vault.getConfig('attachmentFolderPath') || '') : '';
            if (!folderPath || folderPath === './' || folderPath === 'current') {
                // 与当前文件同目录
                if (activePath.includes('/')) {
                    folderPath = activePath.substring(0, activePath.lastIndexOf('/'));
                } else {
                    folderPath = 'attachments';
                }
            }
            if (!this.app.vault.getAbstractFileByPath(folderPath)) {
                await this.ensureFolder(folderPath);
            }
            return `${folderPath}/${fileName}`;
        } catch (e) {
            console.warn('获取附件保存路径失败，使用默认路径 attachments/', e);
            const fallbackFolder = 'attachments';
            if (!this.app.vault.getAbstractFileByPath(fallbackFolder)) {
                await this.ensureFolder(fallbackFolder);
            }
            return `${fallbackFolder}/${fileName}`;
        }
    }

    async ensureFolder(folderPath) {
        const segments = folderPath.split('/');
        let current = '';
        for (const seg of segments) {
            current = current ? `${current}/${seg}` : seg;
            const existing = this.app.vault.getAbstractFileByPath(current);
            if (!existing) {
                await this.app.vault.createFolder(current);
            }
        }
    }

    async writeBinaryEnsuringUnique(targetPath, arrayBuffer) {
        let finalPath = targetPath;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(finalPath)) {
            const dot = targetPath.lastIndexOf('.');
            const slash = targetPath.lastIndexOf('/');
            const base = dot > -1 ? targetPath.substring(0, dot) : targetPath;
            const ext = dot > -1 ? targetPath.substring(dot) : '';
            const prefix = base;
            finalPath = `${prefix}-${counter}${ext}`;
            counter++;
        }

        if (this.app.vault.createBinary) {
            await this.app.vault.createBinary(finalPath, arrayBuffer);
        } else if (this.app.vault.adapter && this.app.vault.adapter.writeBinary) {
            await this.app.vault.adapter.writeBinary(finalPath, arrayBuffer);
        } else {
            throw new Error('没有可用的二进制写入 API');
        }
        return finalPath;
    }

    bindImageInteractions(containerEl) {
        try {
            const imgs = containerEl.querySelectorAll('img');
            imgs.forEach(img => {
                // 包装容器，承载悬浮操作按钮
                let wrapper = img.closest('.chat-ai-image-wrapper');
                if (!wrapper) {
                    wrapper = document.createElement('span');
                    wrapper.className = 'chat-ai-image-wrapper';
                    img.parentElement.insertBefore(wrapper, img);
                    wrapper.appendChild(img);
                }

                // 点击预览大图
                img.addEventListener('click', () => {
                    new ImagePreviewModal(this.app, img.src).open();
                });

                // 右键菜单
                img.addEventListener('contextmenu', (evt) => {
                    evt.preventDefault();
                    try {
                        const menu = new Menu(this.app);
                        menu.addItem(item => item
                            .setTitle('复制到剪贴板')
                            .setIcon('copy')
                            .onClick(async () => {
                                try {
                                    const blob = await this.getImageBlobFromSrc(img.src);
                                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                                    new Notice('图片已复制到剪贴板');
                                } catch (e) {
                                    console.error('复制图片失败:', e);
                                    new Notice('复制失败');
                                }
                            })
                        );
                        menu.addItem(item => item
                            .setTitle('另存为...')
                            .setIcon('save')
                            .onClick(async () => {
                                try {
                                    const blob = await this.getImageBlobFromSrc(img.src);
                                    const ext = this.mimeToExtension(blob.type || 'image/png');
                                    const fileName = await this.generateImageFileName(ext);
                                    new FolderSuggestModal(this.app, async (folder) => {
                                        try {
                                            const destFolder = folder?.path || 'attachments';
                                            if (!this.app.vault.getAbstractFileByPath(destFolder)) {
                                                await this.ensureFolder(destFolder);
                                            }
                                            const destPathCandidate = `${destFolder}/${fileName}`;
                                            const arrayBuffer = await blob.arrayBuffer();
                                            const finalPath = await this.writeBinaryEnsuringUnique(destPathCandidate, arrayBuffer);
                                            new Notice(`已保存到 ${finalPath}`);
                                        } catch (err) {
                                            console.error('另存为失败:', err);
                                            new Notice('另存为失败');
                                        }
                                    }).open();
                                } catch (e) {
                                    console.error('另存为前获取图片失败:', e);
                                    new Notice('另存为失败');
                                }
                            })
                        );
                        menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
                    } catch (e) {
                        console.error('显示右键菜单失败:', e);
                    }
                });

                // 注入悬浮操作栏（复制/保存）
                if (!wrapper.querySelector('.chat-ai-image-actions')) {
                    const actions = document.createElement('div');
                    actions.className = 'chat-ai-image-actions';

                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'chat-ai-img-action-btn';
                    setIcon(copyBtn, 'copy');
                    copyBtn.title = '复制到剪贴板';
                    copyBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        try {
                            const blob = await this.getImageBlobFromSrc(img.src);
                            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                            new Notice('图片已复制到剪贴板');
                        } catch (err) {
                            console.error('复制图片失败:', err);
                            new Notice('复制失败');
                        }
                    });

                    const saveBtn = document.createElement('button');
                    saveBtn.className = 'chat-ai-img-action-btn';
                    setIcon(saveBtn, 'download');
                    saveBtn.title = '另存为...';
                    saveBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        try {
                            const blob = await this.getImageBlobFromSrc(img.src);
                            const ext = this.mimeToExtension(blob.type || 'image/png');
                            const fileName = await this.generateImageFileName(ext);
                            new FolderSuggestModal(this.app, async (folder) => {
                                try {
                                    const destFolder = folder?.path || 'attachments';
                                    if (!this.app.vault.getAbstractFileByPath(destFolder)) {
                                        await this.ensureFolder(destFolder);
                                    }
                                    const destPathCandidate = `${destFolder}/${fileName}`;
                                    const arrayBuffer = await blob.arrayBuffer();
                                    const finalPath = await this.writeBinaryEnsuringUnique(destPathCandidate, arrayBuffer);
                                    new Notice(`已保存到 ${finalPath}`);
                                } catch (err) {
                                    console.error('另存为失败:', err);
                                    new Notice('另存为失败');
                                }
                            }).open();
                        } catch (e) {
                            console.error('另存为前获取图片失败:', e);
                            new Notice('另存为失败');
                        }
                    });

                    actions.appendChild(copyBtn);
                    actions.appendChild(saveBtn);
                    wrapper.appendChild(actions);
                }
            });
        } catch (e) {
            console.error('绑定图片交互失败:', e);
        }
    }

    async getImageBlobFromSrc(src) {
        if (!src) throw new Error('无效的图片地址');
        if (src.startsWith('data:')) {
            const { arrayBuffer, mime } = await this.dataUrlToArrayBuffer(src);
            return new Blob([arrayBuffer], { type: mime });
        }
        const resp = await fetch(src);
        if (!resp.ok) throw new Error(`获取图片失败: ${resp.status}`);
        return await resp.blob();
    }

    // 添加样式
    addStyle() {
        const style = document.createElement('style');
        style.textContent += `
            /* 滚动按钮样式 */
            .chat-ai-scroll-buttons {
                position: absolute;
                right: 16px;
                top: 50%;
                transform: translateY(-50%);
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 100;
                transition: all 0.3s ease;
                opacity: var(--scroll-buttons-opacity, 0.1);
                pointer-events: auto;
            }
            
            .chat-ai-scroll-button {
                cursor: pointer;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 4px;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            }
            
            .chat-ai-scroll-button:hover {
                background: var(--background-secondary);
            }
            
            .chat-ai-scroll-button:active {
                transform: translateY(1px);
                box-shadow: none;
            }
            
            .chat-ai-scroll-buttons-active {
                opacity: calc(var(--scroll-buttons-opacity, 0.1) * 2);
            }
            
            .chat-ai-scroll-buttons-hover {
                opacity: calc(var(--scroll-buttons-opacity, 0.1) * 3);
            }
            
            .chat-ai-scroll-button {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: var(--background-secondary);
                color: var(--text-muted);
                border: 1px solid var(--background-modifier-border);
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                transition: all 0.2s ease;
            }
            
            .chat-ai-scroll-button:hover {
                background: var(--background-modifier-hover);
                transform: translateY(-1px);
                box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
                color: var(--text-normal);
            }
            
            .chat-ai-scroll-button svg {
                width: 18px;
                height: 18px;
            }
            
            .chat-ai-upload-button {
                background: var(--background-modifier-border) !important;
                color: var(--text-normal);
                transition: all 0.2s ease;
                padding: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                cursor: pointer;
            }
            
            .chat-ai-upload-button:hover {
                background: var(--background-modifier-border-hover) !important;
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .chat-ai-upload-button:active {
                transform: translateY(0);
                box-shadow: none;
            }
            
            .chat-ai-image-preview {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 8px;
                background: transparent;
                min-height: 50px;
                margin-bottom: 8px;
                width: 100%;
                box-sizing: border-box;
                border: none;
            }
            
            .image-preview-container {
                position: relative;
                width: 100px;
                height: 100px;
                border-radius: 4px;
                overflow: hidden;
                background: transparent;
                flex: 0 0 auto;
                box-shadow: none;
                border: none;
            }
            
            .image-preview-container img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 4px;
            }

            .remove-image-button {
                position: absolute;
                top: -8px;
                right: -8px;
                background: var(--background-modifier-error);
                color: white;
                border: none;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
                transition: all 0.2s ease;
            }

            .remove-image-button:hover {
                opacity: 1;
                transform: scale(1.1);
            }

            /* 配置按钮悬停效果 */
            .config-button {
                transition: background 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                            box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                            transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .config-button:hover {
                background: var(--background-modifier-hover) !important;
                box-shadow: 0 2px 8px 0 rgba(60,60,60,0.07);
                transform: translateY(-1px) scale(1.01);
            }
            
            /* 自定义配置项悬停效果 */
            .custom-config-item {
                transition: background 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                            box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                            transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .custom-config-item:hover {
                background: var(--background-modifier-hover) !important;
                box-shadow: 0 2px 8px 0 rgba(60,60,60,0.07);
                transform: translateY(-1px) scale(1.01);
            }

            /* 图片悬浮操作按钮 */
            .chat-ai-image-wrapper {
                position: relative;
                display: inline-block;
            }
            .chat-ai-image-actions {
                position: absolute;
                right: 6px;
                bottom: 6px;
                display: flex;
                gap: 6px;
                background: rgba(0,0,0,0.45);
                padding: 4px;
                border-radius: 6px;
                opacity: 0;
                transition: opacity 0.18s ease;
                pointer-events: none;
            }
            .chat-ai-image-wrapper:hover .chat-ai-image-actions {
                opacity: 1;
                pointer-events: auto;
            }
            .chat-ai-img-action-btn {
                width: 22px;
                height: 22px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: var(--background-primary);
                color: var(--text-normal);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                cursor: pointer;
                padding: 0;
            }
            .chat-ai-img-action-btn:hover {
                background: var(--background-secondary);
            }
            .chat-ai-img-action-btn svg {
                width: 16px;
                height: 16px;
                stroke: currentColor;
                fill: none;
                stroke-width: 2px;
            }
        `;
        document.head.appendChild(style);
    }

    // 添加一个新方法来更新专注模式
    async updateFocusMode() {
        if (this.plugin.settings.focusMode) {
            this.containerEl.addClass('focus-mode');
        } else {
            this.containerEl.removeClass('focus-mode');
        }
    }

    // 添加字体大小调整方法
    handleWheel(event) {
        if (event.ctrlKey) {
            event.preventDefault();
            const delta = event.deltaY > 0 ? -1 : 1;
            const newSize = Math.max(8, Math.min(32, (this.plugin.settings.fontSize || 14) + delta));
            
            if (newSize !== this.plugin.settings.fontSize) {
                this.plugin.settings.fontSize = newSize;
                this.applyFontSize();
                this.plugin.saveSettings();
            }
        } else {
            // 检查是否滚动到底部
            const isAtBottom = this.messagesContainer.scrollHeight - this.messagesContainer.scrollTop <= this.messagesContainer.clientHeight + 10;
            
            if (event.deltaY < 0) { // 向上滚动
                this.autoScroll = false;
            } else if (isAtBottom) { // 向下滚动到底部
                this.autoScroll = true;
            }
        }
    }

    // 应用字体大小
    applyFontSize() {
        const size = this.plugin.settings.fontSize;
        this.containerEl.style.setProperty('--chat-font-size', `${size}px`);
    }
    
    // 应用紧凑配置视图
    applyCompactConfigView() {
        if (!this.configButtonsContainer) return;
        
        // 解绑之前可能存在的事件监听器
        if (this.compactViewMouseEnterHandler) {
            this.configButtonsContainer.removeEventListener('mouseenter', this.compactViewMouseEnterHandler);
        }
        if (this.compactViewMouseLeaveHandler) {
            this.configButtonsContainer.removeEventListener('mouseleave', this.compactViewMouseLeaveHandler);
        }
        
        // 获取配置按钮容器的所有子元素（包括按钮和文本）
        const configButtons = Array.from(this.configButtonsContainer.querySelectorAll('button'));
        
        if (this.plugin.settings.compactConfigView) {
            // 计算每行的高度，包括按钮和间距
            let buttonHeight = 0;
            if (configButtons.length > 0) {
                const firstButton = configButtons[0];
                buttonHeight = firstButton.offsetHeight || 32; // 如果无法获取高度，则使用默认值
            }
            
            // 设置容器的样式：只显示第一行
            this.configButtonsContainer.style.maxHeight = `${buttonHeight + 16}px`; // 按钮高度 + 垂直padding
            this.configButtonsContainer.style.overflow = 'hidden';
            
            // 添加鼠标悬停事件：悬停时展开全部
            this.compactViewMouseEnterHandler = () => {
                // 更准确地计算所需的容器高度，让所有按钮都能显示
                // 获取容器宽度
                const containerWidth = this.configButtonsContainer.offsetWidth;
                
                // 计算实际每行能放置的按钮数量
                let currentRowWidth = 0;
                let rowCount = 1;
                
                // 计算标签的宽度
                const labelEl = this.configButtonsContainer.querySelector('span');
                const labelWidth = labelEl ? labelEl.offsetWidth + 8 : 0; // 标签宽度 + 间距
                currentRowWidth += labelWidth;
                
                // 遍历所有按钮，计算实际行数
                configButtons.forEach(button => {
                    const buttonWidth = button.offsetWidth + 8; // 按钮宽度 + 间距
                    
                    // 如果当前行放不下这个按钮，换行
                    if (currentRowWidth + buttonWidth > containerWidth) {
                        rowCount++;
                        currentRowWidth = buttonWidth;
                    } else {
                        currentRowWidth += buttonWidth;
                    }
                });
                
                // 计算所需的总高度
                const fullHeight = (buttonHeight + 8) * rowCount + 16; // 行数 * (按钮高度 + 垂直间距) + 垂直padding
                
                // 设置容器高度，确保能显示所有按钮
                this.configButtonsContainer.style.maxHeight = `${fullHeight}px`;
            };
            
            this.compactViewMouseLeaveHandler = () => {
                this.configButtonsContainer.style.maxHeight = `${buttonHeight + 16}px`;
            };
            
            this.configButtonsContainer.addEventListener('mouseenter', this.compactViewMouseEnterHandler);
            this.configButtonsContainer.addEventListener('mouseleave', this.compactViewMouseLeaveHandler);
        } else {
            // 如果不是紧凑模式，还原默认样式
            this.configButtonsContainer.style.maxHeight = '';
            this.configButtonsContainer.style.overflow = '';
        }
    }

    // 在 ChatView 类中添加一个清理文本的辅助方法
    cleanTextContent(text) {
        return text.trim().replace(/^\n+|\n+$/g, '');  // 移除开头和结尾的空行
    }

    // 添加一个辅助方法来确保历史文件夹存在
    async ensureHistoryFolder() {
        const historyFolderPath = this.plugin.settings.historyPath;
        if (!historyFolderPath) return;

        const folder = this.plugin.app.vault.getAbstractFileByPath(historyFolderPath);
        if (!(folder instanceof TFolder)) {
            try {
                await this.plugin.app.vault.createFolder(historyFolderPath);
                console.log('创建历史记录文件夹');
            } catch (error) {
                console.error('创建历史记录文件夹失败:', error);
                throw error;
            }
        }
    }

    // 在 ChatView 类中添加新方法
    async loadSystemMessageFiles(selectEl) {
        // 清空现有选项
        selectEl.empty();
        
        // 添加空选项
        selectEl.createEl('option', {
            text: '选择System Message',
            value: ''
        });

        // 确保文件夹存在
        let folder = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.systemMessagePath);
        if (!(folder instanceof TFolder)) {
            try {
                folder = await this.plugin.app.vault.createFolder(this.plugin.settings.systemMessagePath);
            } catch (error) {
                console.error('创建system message文件夹失败:', error);
                return;
            }
        }

        // 获取文件夹中的所有md文件
        const files = this.plugin.app.vault.getFiles()
            .filter(file => 
                file.path.startsWith(this.plugin.settings.systemMessagePath) && 
                file.extension === 'md'
            );

        // 添加文件选项
        files.forEach(file => {
            selectEl.createEl('option', {
                text: file.basename,
                value: file.basename + '.md'
            });
        });
        
        // 添加change事件监听器
        selectEl.addEventListener('change', async () => {
            const selectedFile = selectEl.value;
            if (selectedFile) {
                const filePath = `${this.plugin.settings.systemMessagePath}/${selectedFile}`;
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    const content = await this.plugin.app.vault.read(file);
                    this.systemMessageContent = content;
                }
            } else {
                this.systemMessageContent = '';
            }
        });
    }

    // 在 ChatView 类中添加新方法
    registerSystemMessageWatcher() {
        // 如果已经有监听器，先移除
        if (this.systemMessageWatcher) {
            this.app.vault.offref(this.systemMessageWatcher);
        }

        // 添加新的监听器
        this.systemMessageWatcher = this.app.vault.on('modify', async (file) => {
            if (file instanceof TFile && 
                file.path.startsWith(this.plugin.settings.systemMessagePath) && 
                file.basename + '.md' === this.plugin.settings.currentSystemMessageFile) {
                // 文件内容发生变化时更新
                const content = await this.plugin.app.vault.read(file);
                this.plugin.settings.currentSystemMessage = content;
                await this.plugin.saveSettings();
            }
        });
    }

    // 在ChatView类中添加renderConfigButtons方法
    renderConfigButtons() {
        // 如果已有配置按钮容器，先移除
        if (this.configButtonsContainer) {
            this.configButtonsContainer.remove();
        }

        // 安全检查：确保rightPanel存在
        if (!this.rightPanel) {
            return;
        }

        // 找到导航头部容器
        const navButtonsContainer = this.rightPanel.querySelector('.nav-buttons-container');
        if (!navButtonsContainer) {
            return;
        }

        // 创建配置按钮容器，放在导航头部下方
        this.configButtonsContainer = this.rightPanel.createDiv({
                cls: 'config-buttons-container',
                attr: {
                    style: 'display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--background-modifier-border); transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;'
                }
            });

        // 将配置按钮容器插入到导航头部容器之后
        navButtonsContainer.insertAdjacentElement('afterend', this.configButtonsContainer);
        
        // 如果没有自定义配置，则不显示按钮
        if (!Array.isArray(this.plugin.settings.customConfigs) || this.plugin.settings.customConfigs.length === 0) {
            this.configButtonsContainer.style.display = 'none';
            return;
        }
        
        this.configButtonsContainer.style.display = 'flex';
        
        // 添加说明文本
        const configLabel = this.configButtonsContainer.createEl('span', {
            text: '配置：',
            attr: {
                style: 'font-size: var(--font-ui-small); color: var(--text-muted); align-self: center; cursor: context-menu;',
                title: '右击此处新增配置，双击切换紧凑视图'
            }
        });
        
        // 添加右键菜单事件
        configLabel.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // 打开新增配置弹窗
            const modal = new ConfigEditModal(this.app, this.plugin);
            modal.open();
        });
        
        // 添加双击检测变量
        let labelClickCount = 0;
        let labelClickTimer = null;
        
        // 添加双击事件
        configLabel.addEventListener('click', async (e) => {
            // 增加点击计数
            labelClickCount++;
            
            // 检测是否双击
            if (labelClickCount === 1) {
                labelClickTimer = setTimeout(() => {
                    labelClickCount = 0;
                    // 单击不做任何操作
                }, 300); // 300毫秒内判断是否为双击
            } else if (labelClickCount === 2) {
                // 清除单击定时器
                clearTimeout(labelClickTimer);
                labelClickCount = 0;
                
                // 双击逻辑：切换紧凑视图
                this.plugin.settings.compactConfigView = !this.plugin.settings.compactConfigView;
                await this.plugin.saveSettings();
                this.applyCompactConfigView();
                
                // 显示通知
                new Notice(`紧凑视图已${this.plugin.settings.compactConfigView ? '开启' : '关闭'}`);
            }
        });
        
        // 记录拖拽的起始位置
        let dragStartIndex = -1;
        
        // 为每个自定义配置创建一个按钮
        this.plugin.settings.customConfigs.forEach((config, index) => {
            const configButton = this.configButtonsContainer.createEl('button', {
                text: config.name,
                cls: 'config-button',
                attr: {
                    draggable: 'true',
                    'data-index': index,
                    title: '点击使用此配置，右键点击编辑此配置',
                    style: 'padding: 4px 12px; border-radius: 4px; font-size: var(--font-ui-small); background: ' + 
                          (this.plugin.settings.currentCustomConfig === config.name ? 
                           'var(--interactive-accent); color: var(--text-on-accent);' : 
                           'var(--background-modifier-form-field);') +
                           '; cursor: context-menu;'
                }
            });
            
            // 拖拽开始
            configButton.addEventListener('dragstart', (e) => {
                dragStartIndex = parseInt(e.target.getAttribute('data-index'));
                e.target.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', config.name);
            });
            
            // 拖拽结束
            configButton.addEventListener('dragend', (e) => {
                e.target.style.opacity = '1';
                // 重置所有按钮样式
                this.configButtonsContainer.querySelectorAll('.config-button').forEach(btn => {
                    btn.style.border = 'none';
                });
            });
            
            // 拖拽进入
            configButton.addEventListener('dragenter', (e) => {
                e.preventDefault();
                if (e.target.classList.contains('config-button')) {
                    e.target.style.border = '2px dashed var(--interactive-accent)';
                }
            });
            
            // 拖拽离开
            configButton.addEventListener('dragleave', (e) => {
                if (e.target.classList.contains('config-button')) {
                    e.target.style.border = 'none';
                }
            });
            
            // 拖拽悬停
            configButton.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            
            // 拖拽放置
            configButton.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const dragEndIndex = parseInt(e.target.getAttribute('data-index'));
                
                // 确保起始和结束索引有效
                if (dragStartIndex !== -1 && dragEndIndex !== -1 && dragStartIndex !== dragEndIndex) {
                    // 重新排序配置数组
                    const customConfigs = [...this.plugin.settings.customConfigs];
                    const [movedItem] = customConfigs.splice(dragStartIndex, 1);
                    customConfigs.splice(dragEndIndex, 0, movedItem);
                    
                    // 更新设置
                    this.plugin.settings.customConfigs = customConfigs;
                    await this.plugin.saveSettings();
                    
                    // 重新渲染配置按钮
                    this.renderConfigButtons();
                    
                    // 显示通知
                    new Notice('配置顺序已更新');
                }
                
                e.target.style.border = 'none';
            });
            
            // 添加右键菜单事件
            configButton.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                
                // 关闭之前可能存在的上下文菜单
                const existingMenu = document.querySelector('.chat-ai-context-menu');
                if (existingMenu) existingMenu.remove();
                
                // 创建上下文菜单
                const contextMenu = document.createElement('div');
                contextMenu.className = 'chat-ai-context-menu';
                contextMenu.style.position = 'absolute';
                contextMenu.style.left = `${e.pageX}px`;
                contextMenu.style.top = `${e.pageY}px`;
                document.body.appendChild(contextMenu);
                
                // 创建编辑选项
                const editItem = document.createElement('div');
                editItem.className = 'chat-ai-context-menu-item';
                editItem.innerHTML = '<span style="margin-right: 8px; color: var(--text-accent);">✏️</span> 编辑配置';
                editItem.addEventListener('click', () => {
                    // 关闭菜单
                    contextMenu.remove();
                    
                    // 打开配置编辑弹窗
                    const modal = new ConfigEditModal(this.app, this.plugin, config);
                    modal.open();
                });
                contextMenu.appendChild(editItem);
                
                // 创建分隔线
                const separator = document.createElement('div');
                separator.className = 'chat-ai-context-menu-separator';
                contextMenu.appendChild(separator);
                
                // 创建删除选项
                const deleteItem = document.createElement('div');
                deleteItem.className = 'chat-ai-context-menu-item';
                deleteItem.innerHTML = '<span style="margin-right: 8px; color: var(--text-error);">🗑️</span> 删除配置';
                deleteItem.addEventListener('click', async () => {
                    // 关闭菜单
                    contextMenu.remove();
                    
                    // 从设置中移除该配置
                    this.plugin.settings.customConfigs = this.plugin.settings.customConfigs.filter(c => c.name !== config.name);
                    
                    // 如果删除的是当前选中的配置，重置当前配置
                    if (this.plugin.settings.currentCustomConfig === config.name) {
                        this.plugin.settings.currentCustomConfig = '';
                    }
                    
                    // 保存设置
                    await this.plugin.saveSettings();
                    
                    // 重新渲染配置按钮
                    this.renderConfigButtons();
                    
                    // 显示通知
                    new Notice(`配置 "${config.name}" 已删除`);
                });
                contextMenu.appendChild(deleteItem);
                
                // 点击其他地方关闭菜单
                document.addEventListener('click', function closeMenu(e) {
                    if (!contextMenu.contains(e.target)) {
                        contextMenu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            });
            
            // 添加双击检测变量
            let clickCount = 0;
            let clickTimer = null;
            
            configButton.addEventListener('click', async (ev) => {
                // 增加点击计数
                clickCount++;
                
                // 检测是否双击
                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                        
                                                // 单击逻辑：应用配置
                        // 检测是否按下 Ctrl（Windows/Linux）或 Cmd（macOS）进行点击
                        const isCtrlClick = ev.ctrlKey || ev.metaKey;
                        // 应用该配置
                        this.plugin.settings.currentApiKey = config.apiKey;
                        this.plugin.settings.currentBaseUrl = config.baseUrl;
                        this.plugin.settings.currentModel = config.model;
                        this.plugin.settings.useProxy = config.useProxy;
                        this.plugin.settings.proxyUrl = config.proxyUrl;
                        this.plugin.settings.currentCustomConfig = config.name;
                        this.plugin.settings.useStreaming = config.useStreaming; // 添加流式模式设置
                        
                        // 更新system message设置
                        if (config.currentSystemMessageFile) {
                            this.plugin.settings.currentSystemMessageFile = config.currentSystemMessageFile;
                            this.plugin.settings.currentSystemMessage = config.currentSystemMessage || '';
                            
                            // 更新系统消息下拉菜单
                            if (this.rightPanel) {
                                const systemMessageSelect = this.rightPanel.querySelector('.chat-ai-dropdown:nth-child(4)');
                                if (systemMessageSelect) {
                                    Array.from(systemMessageSelect.options).forEach(option => {
                                        option.selected = option.value === config.currentSystemMessageFile;
                                    });
                                }
                            }
                        } else {
                            // 如果配置没有系统消息文件，则将系统消息设置为空
                            this.plugin.settings.currentSystemMessageFile = '';
                            this.plugin.settings.currentSystemMessage = '';

                            // 更新系统消息下拉菜单
                            if (this.rightPanel) {
                                const systemMessageSelect = this.rightPanel.querySelector('.chat-ai-dropdown:nth-child(4)');
                                if (systemMessageSelect) {
                                    Array.from(systemMessageSelect.options).forEach(option => {
                                        option.selected = option.value === '';
                                    });
                                }
                            }
                        }
                        
                        // 保存设置
                        this.plugin.saveSettings().then(async () => {
                            // 更新下拉菜单和按钮状态
                            await this.updateDropdowns();
                            
                            // 刷新配置按钮
                            this.renderConfigButtons();
                            
                            // 如果按下 Ctrl/Cmd 点击，或开启了点击配置自动新建功能，执行新建对话操作
                            if (isCtrlClick || this.plugin.settings.clickConfigAutoNew) {
                                await this.handleNewConversation();
                                // 确保聚焦到输入框
                                setTimeout(() => {
                                    if (this.textarea) {
                                        this.textarea.focus();
                                    }
                                }, 100);
                            }
                        });
                    }, 300); // 300毫秒内判断是否为双击
                } else if (clickCount === 2) {
                    // 清除单击定时器
                    clearTimeout(clickTimer);
                    clickCount = 0;
                    
                    // 双击逻辑：切换紧凑视图
                    this.plugin.settings.compactConfigView = !this.plugin.settings.compactConfigView;
                    await this.plugin.saveSettings();
                    this.applyCompactConfigView();
                    
                    // 显示通知
                    new Notice(`紧凑视图已${this.plugin.settings.compactConfigView ? '开启' : '关闭'}`);
                }
            });
        });
        
        // 所有按钮渲染完毕后，计算并应用紧凑视图
        this.applyCompactConfigView();
    }
    
    // 修改updateDropdowns方法，处理下拉菜单的更新
    async updateDropdowns() {
        // 更新下拉菜单的选项和选中状态
        const baseUrlSelect = this.containerEl.querySelector('.chat-ai-dropdown:nth-child(1)');
        const apiKeySelect = this.containerEl.querySelector('.chat-ai-dropdown:nth-child(2)');
        const modelSelect = this.containerEl.querySelector('.chat-ai-dropdown:nth-child(3)');
        
        // 重新加载baseUrl下拉菜单选项
        if (baseUrlSelect) {
            // 清空现有选项
            baseUrlSelect.innerHTML = '';
            
            // 重新添加所有选项
            this.plugin.settings.baseUrl.forEach(url => {
                const urlMatch = url.match(/(.*?)(https?:\/\/\S+)/);
                if (urlMatch) {
                    const [_, note, baseUrl] = urlMatch;
                    const displayText = note.trim()
                        ? note.trim()  // 只显示备注部分
                        : baseUrl;
                    const option = baseUrlSelect.createEl('option', {
                        text: displayText,
                        value: url
                    });
                    if (url === this.plugin.settings.currentBaseUrl) {
                        option.selected = true;
                    }
                } else {
                    const option = baseUrlSelect.createEl('option', {
                        text: url.trim(),
                        value: url.trim()
                    });
                    if (url.trim() === this.plugin.settings.currentBaseUrl) {
                        option.selected = true;
                    }
                }
            });
        }
        
        // 重新加载apiKey下拉菜单选项
        if (apiKeySelect) {
            // 清空现有选项
            apiKeySelect.innerHTML = '';
            
            // 重新添加所有选项
            this.plugin.settings.apiKey.forEach(line => {
                const { note, key } = parseKeyEntry(line);
                const trimmedLine = line.trim();
                const displayText = note
                    ? note
                    : (key ? `${key.substring(0, 10)}...` : trimmedLine);
                const option = apiKeySelect.createEl('option', {
                    text: displayText,
                    value: trimmedLine
                });
                if (trimmedLine === this.plugin.settings.currentApiKey) {
                    option.selected = true;
                }
            });
        }
        
        // 重新加载model下拉菜单选项
        if (modelSelect) {
            // 清空现有选项
            modelSelect.innerHTML = '';
            
            // 重新添加所有选项
            this.plugin.settings.model.forEach(model => {
                const option = modelSelect.createEl('option', {
                    text: model,
                    value: model
                });
                if (model === this.plugin.settings.currentModel) {
                    option.selected = true;
                }
            });
        }
        
        // 更新代理按钮文本
        const proxyToggle = this.containerEl.querySelector('.proxy-toggle');
        if (proxyToggle) {
            proxyToggle.textContent = this.plugin.settings.useProxy ? '代理已开启' : '代理已关闭';
        }
        
        // 更新流式模式开关状态
        const streamingToggle = this.containerEl.querySelector('.chat-ai-streaming-toggle');
        if (streamingToggle) {
            streamingToggle.textContent = this.plugin.settings.useStreaming ? 'ON' : 'OFF';
            streamingToggle.style.background = this.plugin.settings.useStreaming ? 'var(--interactive-accent)' : 'var(--background-modifier-form-field)';
            streamingToggle.style.color = this.plugin.settings.useStreaming ? 'var(--text-on-accent)' : 'var(--text-normal)';
        }
    }

    // 添加监听历史记录文件变化的方法
    registerHistoryFileWatcher() {
        // 清除已有的监听器
        if (this.historyFileWatcher) {
            this.app.vault.off('create', this.historyFileWatcher.createHandler);
            this.app.vault.off('delete', this.historyFileWatcher.deleteHandler);
            this.app.vault.off('modify', this.historyFileWatcher.modifyHandler);
            this.app.vault.off('rename', this.historyFileWatcher.renameHandler);
        }

        // 定义各种事件处理函数
        this.historyFileWatcher = {
            createHandler: (file) => {
                // 只处理历史记录文件夹中的markdown文件
                if (file.path.startsWith(this.plugin.settings.historyPath) && file.extension === 'md') {
                    this.updateHistoryItem(file, 'create');
                }
            },
            deleteHandler: (file) => {
                // 只处理历史记录文件夹中的markdown文件
                if (file.path.startsWith(this.plugin.settings.historyPath) && file.extension === 'md') {
                    this.updateHistoryItem(file, 'delete');
                }
            },
            modifyHandler: (file) => {
                // 只处理历史记录文件夹中的markdown文件
                if (file.path.startsWith(this.plugin.settings.historyPath) && file.extension === 'md') {
                    this.updateHistoryItem(file, 'modify');
                }
            },
            renameHandler: (file, oldPath) => {
                // 只处理历史记录文件夹中的markdown文件
                if ((file.path.startsWith(this.plugin.settings.historyPath) || oldPath.startsWith(this.plugin.settings.historyPath)) 
                    && file.extension === 'md') {
                    this.updateHistoryItem(file, 'rename', oldPath);
                }
            }
        };

        // 注册事件监听器
        this.app.vault.on('create', this.historyFileWatcher.createHandler);
        this.app.vault.on('delete', this.historyFileWatcher.deleteHandler);
        this.app.vault.on('modify', this.historyFileWatcher.modifyHandler);
        this.app.vault.on('rename', this.historyFileWatcher.renameHandler);
    }

    // 精确更新历史记录项方法
    async updateHistoryItem(file, action, oldPath = null) {
        console.log(`更新历史项: ${file.path}, 动作: ${action}, 旧路径: ${oldPath || 'N/A'}`);
        
        // 获取历史记录列表容器 - 修复父级元素定位
        const leftPanel = this.containerEl.querySelector('.chat-ai-left-panel');
        if (!leftPanel) {
            console.log('找不到左侧面板');
            return;
        }
        
        const historyListContainer = leftPanel.querySelector('.chat-ai-history-list');
        if (!historyListContainer) {
            console.log('找不到历史记录列表容器');
            return;
        }

        // 处理文件删除
        if (action === 'delete') {
            console.log(`删除文件: ${file.path}`);
            // 查找对应的历史项元素，使用准确的属性选择器
            const historyItem = Array.from(historyListContainer.querySelectorAll('.chat-ai-history-item'))
                .find(item => item.getAttribute('data-path') === file.path);
                
            if (historyItem) {
                console.log('找到对应历史项，移除中...');
                historyItem.remove();
                
                // 检查并可能更新分隔线
                this.updateHistorySections(historyListContainer);
            } else {
                console.log('找不到对应的历史项元素');
            }
            return;
        }

        // 处理文件重命名
        if (action === 'rename' && oldPath) {
            console.log(`重命名文件: ${oldPath} -> ${file.path}`);
            // 查找旧路径的历史项元素
            const historyItem = Array.from(historyListContainer.querySelectorAll('.chat-ai-history-item'))
                .find(item => item.getAttribute('data-path') === oldPath);
                
            if (historyItem) {
                console.log('找到对应历史项，更新中...');
                // 更新data-path属性
                historyItem.setAttribute('data-path', file.path);
                
                // 获取文件标题并更新
                const title = this.getFileTitle(file);
                const titleEl = historyItem.querySelector('[data-filename]') || 
                                historyItem.querySelector('.chat-ai-history-item-title');
                if (titleEl) {
                    titleEl.textContent = title;
                    if (titleEl.hasAttribute('data-filename')) {
                        titleEl.setAttribute('data-filename', file.basename);
                    }
                }
            } else {
                console.log('找不到对应的历史项元素');
            }
            return;
        }

        // 处理文件创建或修改
        if (action === 'create' || action === 'modify') {
            console.log(`${action === 'create' ? '创建' : '修改'}文件: ${file.path}`);
            
            // 检查文件是否已经有历史项
            const existingItem = Array.from(historyListContainer.querySelectorAll('.chat-ai-history-item'))
                .find(item => item.getAttribute('data-path') === file.path);
            
            // 获取文件是否已加星标
            const isStarred = this.plugin.settings.starredHistoryFiles.includes(file.path);
            
            // 如果是已有项的修改，更新时间戳
            if (existingItem && action === 'modify') {
                console.log('找到现有历史项，更新时间戳');
                // 改进时间元素查找逻辑
                let timeEl = existingItem.querySelector('.chat-ai-history-item-time');
                
                // 尝试多种选择器方法找到时间元素
                if (!timeEl) {
                    // 尝试查找第二个子元素
                    const itemContent = existingItem.querySelector('div:first-child');
                    if (itemContent) {
                        timeEl = itemContent.querySelector('div:nth-child(2)');
                    }
                }
                
                // 如果仍找不到，尝试更多的选择器
                if (!timeEl) {
                    // 尝试找到所有文本大小较小的元素
                    const smallTexts = existingItem.querySelectorAll('div');
                    for (const el of smallTexts) {
                        if (el.style.fontSize && el.style.fontSize.includes('0.8em')) {
                            timeEl = el;
                            break;
                        }
                    }
                }
                
                if (timeEl) {
                    timeEl.textContent = this.formatDateTime(new Date(file.stat.mtime));
                    console.log('时间元素已更新');
                } else {
                    console.log('找不到时间元素，创建新元素');
                    // 如果实在找不到，创建一个新的时间元素
                    const itemContent = existingItem.querySelector('div:first-child') || existingItem;
                    const newTimeEl = document.createElement('div');
                    newTimeEl.textContent = this.formatDateTime(new Date(file.stat.mtime));
                    newTimeEl.style = 'font-size: 0.8em; color: var(--text-muted);';
                    newTimeEl.className = 'chat-ai-history-item-time';
                    itemContent.appendChild(newTimeEl);
                }
                return;
            }
            
            // 如果是新建文件但已存在历史项，不做任何操作
            if (action === 'create' && existingItem) {
                console.log('文件已有历史项，跳过创建');
                return;
            }
            
            // 如果是新建文件且不存在历史项，创建新的历史项
            if (action === 'create' && !existingItem) {
                console.log('创建新的历史项');
                
                // 这里使用原有的createHistoryItem函数来保持一致性
                // 先找到合适的父级容器
                let targetSection;
                
                if (isStarred) {
                    // 寻找星标区域
                    const sections = historyListContainer.querySelectorAll('.chat-ai-history-section');
                    targetSection = Array.from(sections).find(section => {
                        const title = section.querySelector('.chat-ai-history-section-title');
                        return title && title.textContent.includes('星标');
                    });
                    
                    if (!targetSection) {
                        console.log('找不到星标区域，尝试创建');
                        // 如果没有找到，尝试使用第一个区域
                        targetSection = historyListContainer.querySelector('.chat-ai-history-section:first-child');
                        
                        // 如果仍然没有，或者第一个区域不是星标区域，创建一个
                        if (!targetSection || !targetSection.querySelector('.chat-ai-history-section-title')?.textContent.includes('星标')) {
                            targetSection = document.createElement('div');
                            targetSection.className = 'chat-ai-history-section';
                            
                            const sectionTitle = document.createElement('div');
                            sectionTitle.className = 'chat-ai-history-section-title';
                            sectionTitle.textContent = '星标历史记录';
                            targetSection.appendChild(sectionTitle);
                            
                            historyListContainer.prepend(targetSection);
                            
                            // 添加分隔线
                            const divider = document.createElement('div');
                            divider.className = 'chat-ai-star-divider';
                            historyListContainer.insertBefore(divider, targetSection.nextSibling);
                        }
                    }
                } else {
                    // 对于非星标文件，先检查是否有星标区域
                    const sections = historyListContainer.querySelectorAll('.chat-ai-history-section');
                    const starredSection = Array.from(sections).find(section => {
                        const title = section.querySelector('.chat-ai-history-section-title');
                        return title && title.textContent.includes('星标');
                    });
                    
                    if (starredSection) {
                        // 如果有星标区域，则尝试找到或创建非星标区域
                        targetSection = Array.from(sections).find(section => {
                            const title = section.querySelector('.chat-ai-history-section-title');
                            return title && title.textContent.includes('历史记录') && !title.textContent.includes('星标');
                        });
                        
                        if (!targetSection) {
                            console.log('找不到非星标区域，创建一个');
                            targetSection = document.createElement('div');
                            targetSection.className = 'chat-ai-history-section';
                            
                            const sectionTitle = document.createElement('div');
                            sectionTitle.className = 'chat-ai-history-section-title';
                            sectionTitle.textContent = '历史记录';
                            targetSection.appendChild(sectionTitle);
                            
                            // 检查是否需要添加分隔线
                            if (!historyListContainer.querySelector('.chat-ai-star-divider')) {
                                const divider = document.createElement('div');
                                divider.className = 'chat-ai-star-divider';
                                historyListContainer.appendChild(divider);
                            }
                            
                            historyListContainer.appendChild(targetSection);
                        }
                    } else {
                        // 如果没有星标区域，使用现有区域或创建新区域
                        targetSection = historyListContainer.querySelector('.chat-ai-history-section');
                        if (!targetSection) {
                            console.log('找不到任何区域，创建默认区域');
                            targetSection = document.createElement('div');
                            targetSection.className = 'chat-ai-history-section';
                            historyListContainer.appendChild(targetSection);
                        }
                    }
                }
                
                console.log(`将在 ${isStarred ? '星标' : '普通'} 区域创建历史项`);
                
                // 调用原有的创建历史项方法 - 修复this.root引用的问题
                if (typeof window.createHistoryItem === 'function') {
                    // 如果全局函数可用
                    window.createHistoryItem(file, isStarred, targetSection);
                } else if (typeof this.createHistoryItem === 'function') {
                    // 尝试使用本地方法
                    this.createHistoryItem(file, isStarred, targetSection);
                } else {
                    // 使用内联实现
            const historyItem = document.createElement('div');
            historyItem.className = `chat-ai-history-item ${isStarred ? 'chat-ai-starred' : ''}`;
                    historyItem.style = 'padding: 8px; margin-bottom: 8px; border-radius: 4px; background: var(--background-modifier-hover); cursor: pointer; transition: background-color 0.2s; position: relative;';
                    historyItem.setAttribute('data-path', file.path);
                    
                    // 添加悬停效果
                    historyItem.addEventListener('mouseover', () => {
                        historyItem.style.backgroundColor = 'var(--background-primary-alt)';
                    });
                    historyItem.addEventListener('mouseout', () => {
                        historyItem.style.backgroundColor = 'var(--background-modifier-hover)';
                    });
                    
                    // 创建历史记录项内容
                    const itemContent = document.createElement('div');
                    itemContent.style = 'display: flex; flex-direction: column; gap: 4px;';
                    historyItem.appendChild(itemContent);
                    
                    // 添加文件名（日期）
                    const filenameEl = document.createElement('div');
                    filenameEl.textContent = this.getFileTitle(file);
                    filenameEl.style = 'font-weight: 500; color: var(--text-normal);';
                    filenameEl.setAttribute('data-filename', file.basename);
                    itemContent.appendChild(filenameEl);
                    
                    // 添加修改时间
                    const timeEl = document.createElement('div');
                    timeEl.textContent = this.formatDateTime(new Date(file.stat.mtime));
                    timeEl.style = 'font-size: 0.8em; color: var(--text-muted);';
                    timeEl.className = 'chat-ai-history-item-time';
                    itemContent.appendChild(timeEl);
                    
                    // 添加点击事件
                    historyItem.addEventListener('click', () => {
                        this.plugin.loadHistoryFile(file).then(() => {
                            this.messages = [...this.plugin.settings.chatHistory];
                            this.renderMessages();
                        });
                    });
                    
                    // 添加星标图标
                    const starIcon = document.createElement('span');
                    starIcon.innerHTML = isStarred ? '★' : '☆';
                    starIcon.style = 'position: absolute; top: 4px; right: 8px; cursor: pointer; font-size: 16px; color: var(--interactive-accent);';
                    starIcon.className = 'chat-ai-star-icon';
                    
                    // 添加星标点击事件
                    starIcon.addEventListener('click', async (e) => {
                        e.stopPropagation(); // 阻止事件冒泡
                        // 切换星标状态
                        if (isStarred) {
                            // 移除星标
                            const index = this.plugin.settings.starredHistoryFiles.indexOf(file.path);
                            if (index > -1) {
                                this.plugin.settings.starredHistoryFiles.splice(index, 1);
                                await this.plugin.saveSettings();
                            }
                            // 重新加载历史记录列表
                            await this.loadChatHistory();
                        } else {
                            // 添加星标
                            this.plugin.settings.starredHistoryFiles.push(file.path);
                            await this.plugin.saveSettings();
                            // 重新加载历史记录列表
                            await this.loadChatHistory();
                        }
                    });
                    
                    historyItem.appendChild(starIcon);
                    
                    // 将项添加到目标部分
                    if (targetSection.childElementCount > 0) {
                        // 插入到标题后，其他项前
                        const firstHistoryItem = targetSection.querySelector('.chat-ai-history-item');
                        if (firstHistoryItem) {
                            targetSection.insertBefore(historyItem, firstHistoryItem);
                        } else {
                            targetSection.appendChild(historyItem);
                        }
                    } else {
                        targetSection.appendChild(historyItem);
                    }
                }
                
                // 更新分隔线
                this.updateHistorySections(historyListContainer);
            }
        }
    }
    
    // 更新历史记录区域
    updateHistorySections(historyListContainer) {
        const starredSection = historyListContainer.querySelector('.chat-ai-history-section:first-child');
        const normalSection = historyListContainer.querySelector('.chat-ai-history-section:not(:first-child)');
        const divider = historyListContainer.querySelector('.chat-ai-star-divider');
        
        // 确保星标区域存在星标项
        if (starredSection) {
            const starredItems = starredSection.querySelectorAll('.chat-ai-history-item');
            if (starredItems.length === 0) {
                starredSection.remove();
                if (divider) divider.remove();
            }
        }
        
        // 确保非星标区域存在非星标项
        if (normalSection) {
            const normalItems = normalSection.querySelectorAll('.chat-ai-history-item');
            if (normalItems.length === 0) {
                normalSection.remove();
                if (divider) divider.remove();
            }
        }
        
        // 检查是否需要分隔线
        if (starredSection && normalSection) {
            if (!divider) {
                const newDivider = document.createElement('div');
                newDivider.className = 'chat-ai-star-divider';
                historyListContainer.insertBefore(newDivider, normalSection);
            }
        }
    }
    
    // 创建历史项内容
    createHistoryItemContent(historyItem, file, isStarred) {
        // 左侧部分 - 标题和时间
        const leftSide = document.createElement('div');
        leftSide.className = 'chat-ai-history-item-left';
        
        // 标题
        const title = document.createElement('div');
        title.className = 'chat-ai-history-item-title';
        title.textContent = this.getFileTitle(file);
        leftSide.appendChild(title);
        
        // 时间
        const time = document.createElement('div');
        time.className = 'chat-ai-history-item-time';
        time.textContent = this.formatDateTime(new Date(file.stat.mtime));
        leftSide.appendChild(time);
        
        historyItem.appendChild(leftSide);
        
        // 创建路径元素
        const pathEl = document.createElement('div');
        pathEl.className = 'chat-ai-history-item-path';
        pathEl.style.display = 'none';
        pathEl.textContent = file.path;
        historyItem.appendChild(pathEl);
        
        // 添加点击事件 - 加载历史记录
        historyItem.addEventListener('click', (event) => {
            if (event.target.closest('.chat-ai-star-icon')) return;
            this.plugin.loadHistoryFile(file).then(() => {
                this.messages = [...this.plugin.settings.chatHistory];
                this.renderMessages();
                if (this.plugin.settings.autoScrollAfterHistorySwitch) {
                    this.scrollToBottom();
                }
            });
        });
        
        // 添加右键菜单
        this.addHistoryItemContextMenu(historyItem, file, isStarred);
        
        // 添加星标图标
        const starIcon = document.createElement('span');
        starIcon.className = 'chat-ai-star-icon';
        starIcon.innerHTML = isStarred ? '★' : '☆';
        starIcon.style.cursor = 'pointer';
        starIcon.style.marginLeft = 'auto';
        starIcon.style.fontSize = '16px';
        starIcon.style.color = 'var(--interactive-accent)';
        
        // 添加星标点击事件
        starIcon.addEventListener('click', async (event) => {
            event.stopPropagation();
            await this.toggleHistoryItemStar(file, historyItem, isStarred);
        });
        
        historyItem.appendChild(starIcon);
    }
    
    // 切换历史项的星标状态
    async toggleHistoryItemStar(file, historyItem, isStarred) {
        // 获取历史记录列表容器 - 修复父级元素定位
        const leftPanel = this.containerEl.querySelector('.chat-ai-left-panel');
        if (!leftPanel) {
            console.log('找不到左侧面板');
            return;
        }
        
        const historyListContainer = leftPanel.querySelector('.chat-ai-history-list');
        if (!historyListContainer) {
            console.log('找不到历史记录列表容器');
            return;
        }
        
        if (isStarred) {
            // 取消星标
            const index = this.plugin.settings.starredHistoryFiles.indexOf(file.path);
            if (index > -1) {
                this.plugin.settings.starredHistoryFiles.splice(index, 1);
                await this.plugin.saveSettings();
            }
            
            historyItem.classList.remove('chat-ai-starred');
            historyItem.querySelector('.chat-ai-star-icon').innerHTML = '☆';
            
            // 将项移动到普通区域
            const normalSection = historyListContainer.querySelector('.chat-ai-history-section:not(:first-child)');
            if (normalSection) {
                normalSection.prepend(historyItem);
            } else {
                // 如果没有普通区域，创建一个
                const newSection = document.createElement('div');
                newSection.className = 'chat-ai-history-section';
                
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'chat-ai-history-section-title';
                sectionTitle.textContent = '历史记录';
                newSection.appendChild(sectionTitle);
                
                newSection.appendChild(historyItem);
                
                const divider = document.createElement('div');
                divider.className = 'chat-ai-star-divider';
                
                historyListContainer.appendChild(divider);
                historyListContainer.appendChild(newSection);
            }
        } else {
            // 添加星标
            this.plugin.settings.starredHistoryFiles.push(file.path);
            await this.plugin.saveSettings();
            
            historyItem.classList.add('chat-ai-starred');
            historyItem.querySelector('.chat-ai-star-icon').innerHTML = '★';
            
            // 将项移动到星标区域
            let starredSection = historyListContainer.querySelector('.chat-ai-history-section:first-child');
            const firstSectionHasStarTitle = starredSection && starredSection.querySelector('.chat-ai-history-section-title')?.textContent.includes('星标');
            
            if (!firstSectionHasStarTitle) {
                // 创建星标区域
                starredSection = document.createElement('div');
                starredSection.className = 'chat-ai-history-section';
                
                const sectionTitle = document.createElement('div');
                sectionTitle.className = 'chat-ai-history-section-title';
                sectionTitle.textContent = '星标历史记录';
                starredSection.appendChild(sectionTitle);
                
                starredSection.appendChild(historyItem);
                
                // 添加分隔线
                const divider = document.createElement('div');
                divider.className = 'chat-ai-star-divider';
                
                // 插入到开头
                historyListContainer.insertBefore(starredSection, historyListContainer.firstChild);
                historyListContainer.insertBefore(divider, starredSection.nextSibling);
            } else {
                // 添加到已有星标区域
                starredSection.appendChild(historyItem);
            }
        }
        
        // 更新区域显示
        this.updateHistorySections(historyListContainer);
    }
    
    // 获取文件标题
    getFileTitle(file) {
        // 从文件名移除日期前缀和.md后缀
        let title = file.basename;
        
        // 移除类似 YYYY-MM-DD-HHmmss- 格式的日期前缀
        const datePrefix = /^\d{4}-\d{2}-\d{2}-\d{6}-/;
        title = title.replace(datePrefix, '');
        
        return title;
    }
    
    // 格式化日期时间
    formatDateTime(date) {
        const now = new Date();
        const diff = now - date;
        
        // 今天的显示时间
        if (diff < 24 * 60 * 60 * 1000 && 
            date.getDate() === now.getDate() && 
            date.getMonth() === now.getMonth() && 
            date.getFullYear() === now.getFullYear()) {
            return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // 昨天的显示昨天
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.getDate() === yesterday.getDate() && 
            date.getMonth() === yesterday.getMonth() && 
            date.getFullYear() === yesterday.getFullYear()) {
            return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        
        // 其他显示日期
        return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }
    
    // 添加历史项的右键菜单
    addHistoryItemContextMenu(historyItem, file, isStarred) {
        historyItem.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            // ... 现有的右键菜单代码 ...
        });
    }

    // 新增：处理用户消息编辑
    async handleEditUserMessage(messageIndex) {
        const originalMessageData = this.messages[messageIndex];
        if (!originalMessageData || originalMessageData.role !== 'user') {
            new Notice('无法编辑此消息。');
            console.error('EditError: Invalid message index or role for editing. Index:', messageIndex);
            return;
        }

        const modal = new TextEditModal(
            this.app,
            '编辑消息',
            originalMessageData.content,
            async (newTextContent) => {
                if (newTextContent === null || newTextContent.trim() === originalMessageData.content.trim()) {
                    // Content hasn't changed or modal was cancelled
                    return;
                }

                // 1. Update the message in this.messages
                this.messages[messageIndex].content = newTextContent.trim();
                this.messages[messageIndex].time = new Date(); // Update timestamp

                // 2. Truncate messages array (and chatHistory) to this point
                this.messages = this.messages.slice(0, messageIndex + 1);
                this.plugin.settings.chatHistory = [...this.messages];
                await this.plugin.saveSettings();

                // 3. Update UI to show edited message and remove subsequent ones
                this.renderMessages();

                // 4. Save truncated history to files
                await this.saveTempChatHistory();
                if (this.plugin.settings.currentHistoryFile) {
                    const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.currentHistoryFile);
                    if (file instanceof TFile) {
                        const contentToSave = this.formatMessagesToMarkdown(this.messages);
                        await this.plugin.app.vault.modify(file, contentToSave);
                    }
                }

                // 5. Prepare for AI call
                this.pendingImages = originalMessageData.images ? [...originalMessageData.images] : [];
                this.imagePreviewArea.empty(); // Clear previous previews
                if (this.pendingImages.length > 0) {
                    this.imagePreviewArea.style.display = 'flex';
                    this.pendingImages.forEach(base64Img => this.addImagePreview(base64Img));
                } else {
                    this.imagePreviewArea.style.display = 'none';
                }
                this.autoScroll = true;

                // 6. Create new assistant message placeholder (adds to this.messages and this.plugin.settings.chatHistory)
                const assistantMessageEl = this.createAssistantMessageElement();
                this.scrollToBottom();

                // 7. Call AI
                try {
                    await this.callAI(assistantMessageEl); // callAI updates content in both arrays

                    // 8. Save history with AI response
                    await this.saveTempChatHistory();
                    if (this.plugin.settings.currentHistoryFile) {
                        const file = this.plugin.app.vault.getAbstractFileByPath(this.plugin.settings.currentHistoryFile);
                        if (file instanceof TFile) {
                            const finalContentToSave = this.formatMessagesToMarkdown(this.messages);
                            await this.plugin.app.vault.modify(file, finalContentToSave);
                        }
                    }
                    await this.plugin.saveSettings(); // Final save with AI response integrated
                    await this.updateSettings(); // 使用更新设置的方法而不是创建新的窗口
                    await this.updateDropdowns(); // 更新下拉菜单

                } catch (error) {
                    console.error('调用AI时发生错误 (编辑后):', error);
                    if (assistantMessageEl) { // Ensure element exists
                        const contentEl = assistantMessageEl.querySelector('.message-content');
                        if (contentEl) contentEl.textContent = `错误: ${error.message}`;
                    }
                    new Notice('调用AI时发生错误。');
                    // Save whatever state we have, including the error placeholder
                    await this.saveTempChatHistory(); 
                    await this.plugin.saveSettings();
                }
            }
        );
        modal.open();
    }
}

// 插件设置界面
class CallAIChatSettingsTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async saveAndUpdateViews(newSettings) {
        // 更新设置
        Object.assign(this.plugin.settings, newSettings);
        await this.plugin.saveSettings();

        // 更新所有打开的聊天视图
        this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
            if (leaf.view instanceof ChatView) {
                leaf.view.updateSettings();
            }
        });
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '对话AI 插件设置' });

        // 导入导出设置区域 - 移动到顶部
        new Setting(containerEl)
            .setName('导入导出设置')
            .setDesc('导出设置到剪贴板或从剪贴板导入设置（包含System Message文件）')
            .addButton(button => button
                .setButtonText('📤 导出')
                .onClick(async () => {
                    const exportSettings = {
                        apiKey: this.plugin.settings.apiKey,
                        baseUrl: this.plugin.settings.baseUrl,
                        model: this.plugin.settings.model,
                        currentApiKey: this.plugin.settings.currentApiKey,
                        currentBaseUrl: this.plugin.settings.currentBaseUrl,
                        currentModel: this.plugin.settings.currentModel,
                        temperature: this.plugin.settings.temperature,
                        useProxy: this.plugin.settings.useProxy,
                        proxyUrl: this.plugin.settings.proxyUrl,
                        systemMessagePath: this.plugin.settings.systemMessagePath,
                        currentSystemMessage: this.plugin.settings.currentSystemMessage,
                        currentSystemMessageFile: this.plugin.settings.currentSystemMessageFile,
                        customConfigs: this.plugin.settings.customConfigs || [], // 添加自定义配置
                        currentCustomConfig: this.plugin.settings.currentCustomConfig || '', // 添加当前使用的自定义配置名称
                        systemMessageFiles: {} // 添加System Message文件内容
                    };
                    
                    // 导出System Message目录下的所有文件
                    try {
                        const systemMessagePath = this.plugin.settings.systemMessagePath;
                        if (systemMessagePath) {
                            const folder = this.plugin.app.vault.getAbstractFileByPath(systemMessagePath);
                            if (folder instanceof TFolder) {
                                const files = this.plugin.app.vault.getFiles()
                                    .filter(file => 
                                        file.path.startsWith(systemMessagePath) && 
                                        file.extension === 'md'
                                    );
                                
                                for (const file of files) {
                                    const content = await this.plugin.app.vault.read(file);
                                    exportSettings.systemMessageFiles[file.name] = content;
                                }
                                
                                new Notice(`已导出 ${files.length} 个System Message文件`);
                            }
                        }
                    } catch (error) {
                        console.error('导出System Message文件失败:', error);
                        new Notice('导出System Message文件时出现错误，但其他设置已导出');
                    }
                    
                    await navigator.clipboard.writeText(JSON.stringify(exportSettings, null, 2));
                    new Notice('设置已复制到剪贴板');
                }))
            .addButton(button => button
                .setButtonText('📥 导入')
                .onClick(async () => {
                    try {
                        const text = await navigator.clipboard.readText();
                        const importedSettings = JSON.parse(text);
                        
                        // 验证导入的设置格式
                        const requiredKeys = ['apiKey', 'baseUrl', 'model'];
                        const missingKeys = requiredKeys.filter(key => !importedSettings.hasOwnProperty(key));
                        
                        if (missingKeys.length > 0) {
                            new Notice(`导入失败: 缺少必要的设置项 ${missingKeys.join(', ')}`);
                            return;
                        }
                        
                        // 处理System Message文件导入
                        const importSystemMessageFiles = async (overrideMode = false) => {
                            let systemMessageCount = 0;
                            if (importedSettings.systemMessageFiles && typeof importedSettings.systemMessageFiles === 'object') {
                                try {
                                    // 确保System Message目录存在
                                    const systemMessagePath = importedSettings.systemMessagePath || this.plugin.settings.systemMessagePath;
                                    if (systemMessagePath) {
                                        let folder = this.plugin.app.vault.getAbstractFileByPath(systemMessagePath);
                                        if (!(folder instanceof TFolder)) {
                                            await this.plugin.app.vault.createFolder(systemMessagePath);
                                        }
                                        
                                        // 导入每个System Message文件
                                        for (const [fileName, content] of Object.entries(importedSettings.systemMessageFiles)) {
                                            const filePath = `${systemMessagePath}/${fileName}`;
                                            const existingFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
                                            
                                            if (existingFile instanceof TFile) {
                                                if (overrideMode) {
                                                    // 覆盖模式：直接覆盖文件内容
                                                    await this.plugin.app.vault.modify(existingFile, content);
                                                    systemMessageCount++;
                                                } else {
                                                    // 追加模式：跳过已存在的文件
                                                    continue;
                                                }
                                            } else {
                                                // 创建新文件
                                                await this.plugin.app.vault.create(filePath, content);
                                                systemMessageCount++;
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.error('导入System Message文件失败:', error);
                                    new Notice('导入System Message文件时出现错误');
                                }
                            }
                            return systemMessageCount;
                        };

                        // 打开选择模式对话框
                        new ImportModeModal(this.app, async (mode) => {
                            if (mode === 'override') {
                                // 覆盖模式：直接替换所有设置
                                Object.assign(this.plugin.settings, importedSettings);
                                await this.plugin.saveSettings();
                                
                                // 导入System Message文件（覆盖模式）
                                const systemMessageCount = await importSystemMessageFiles(true);
                                
                                this.display(); // 刷新设置界面
                                new Notice(`设置已完全覆盖导入${systemMessageCount > 0 ? `，导入了 ${systemMessageCount} 个System Message文件` : ''}`);
                            } else {
                                // 追加模式：只添加新的设置项
                                const changes = [];
                                
                                // 处理数组类型的设置
                                ['apiKey', 'baseUrl', 'model'].forEach(key => {
                                    const currentSet = new Set(this.plugin.settings[key]);
                                    const newItems = importedSettings[key].filter(item => !currentSet.has(item));
                                    
                                    if (newItems.length > 0) {
                                        this.plugin.settings[key].push(...newItems);
                                        changes.push(`${key}: +${newItems.length}项`);
                                    }
                                });
                                
                                // 处理自定义配置的导入
                                if (importedSettings.customConfigs && Array.isArray(importedSettings.customConfigs)) {
                                    // 确保自定义配置数组已初始化
                                    if (!Array.isArray(this.plugin.settings.customConfigs)) {
                                        this.plugin.settings.customConfigs = [];
                                    }
                                    
                                    // 记录现有的配置名称
                                    const existingConfigNames = new Set(
                                        this.plugin.settings.customConfigs.map(config => config.name)
                                    );
                                    
                                    // 只导入不存在的配置
                                    const newConfigs = importedSettings.customConfigs.filter(
                                        config => !existingConfigNames.has(config.name)
                                    );
                                    
                                    if (newConfigs.length > 0) {
                                        this.plugin.settings.customConfigs.push(...newConfigs);
                                        changes.push(`自定义配置: +${newConfigs.length}项`);
                                    }
                                }
                                
                                // 导入System Message文件（追加模式，只导入新文件）
                                const systemMessageCount = await importSystemMessageFiles(false);
                                if (systemMessageCount > 0) {
                                    changes.push(`System Message文件: +${systemMessageCount}项`);
                                }
                                
                                await this.plugin.saveSettings();
                                this.display(); // 刷新设置界面
                                
                                if (changes.length > 0) {
                                    new Notice(`追加导入成功:\n${changes.join('\n')}`);
                                } else {
                                    new Notice('没有新的设置需要导入');
                                }
                            }
                        }).open();
                        
                    } catch (error) {
                        new Notice('导入失败: 剪贴板内容格式不正确');
                        console.error('导入设置失败:', error);
                    }
                }));

        // API Key 设置
        new Setting(containerEl)
            .setName('API 密钥')
            .setDesc('选择或编辑你的 API 密钥列表')
            .addDropdown(dropdown => {
                dropdown.selectEl.style.width = '240px';  // 添加固定宽度
                this.apiKeyDropdown = dropdown;
                // 确保 apiKey 是数组
                if (!Array.isArray(this.plugin.settings.apiKey)) {
                    this.plugin.settings.apiKey = this.plugin.settings.apiKey.split('\n').filter(line => line.trim());
                }
                // 添加选项到下拉菜单
                this.plugin.settings.apiKey.forEach(line => {
                    const { note, key } = parseKeyEntry(line);
                    const trimmedLine = line.trim();
                    const displayText = note
                        ? note
                        : (key ? `${key.substring(0, 10)}...` : trimmedLine);
                    dropdown.addOption(trimmedLine, displayText);
                });
                // 设置当前选中值
                if (this.plugin.settings.apiKey.length > 0) {
                    dropdown.setValue(this.plugin.settings.currentApiKey || this.plugin.settings.apiKey[0]);
                }
                // 处理选择变更
                dropdown.onChange(async (value) => {
                    await this.saveAndUpdateViews({ currentApiKey: value });
                });
            })
            .addButton(button => button
                .setButtonText('编辑列表')
                .onClick(() => {
                    const modal = new ParameterEditModal(
                        this.app,
                        this.plugin,
                        'key',
                        this.plugin.settings.currentApiKey,
                        async (apiKeys) => {
                            await this.saveAndUpdateViews({
                                apiKey: apiKeys,
                                currentApiKey: apiKeys.length > 0 ? apiKeys[0] : ''
                            });
                            
                            // 更新所有打开的聊天视图
                            this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
                                if (leaf.view instanceof ChatView) {
                                    leaf.view.onOpen(); // 重新加载整个视图
                                }
                            });
                            
                            this.display(); // 重新显示设置面板
                        }
                    );
                    modal.open();
                }));

        // Base URL 设置
        new Setting(containerEl)
            .setName('Base URL')
            .setDesc('选择或编辑API基础地址列表')
            .addDropdown(dropdown => {
                dropdown.selectEl.style.width = '240px';  // 添加固定宽度
                this.baseUrlDropdown = dropdown;
                // 确保 baseUrl 是数组
                if (!Array.isArray(this.plugin.settings.baseUrl)) {
                    this.plugin.settings.baseUrl = [this.plugin.settings.baseUrl];
                }
                this.plugin.settings.baseUrl.forEach(url => {
                    const urlMatch = url.match(/(.*?)(https?:\/\/\S+)/);
                    if (urlMatch) {
                        const [_, note, baseUrl] = urlMatch;
                        const displayText = note.trim()
                            ? note.trim()  // 只显示备注部分
                            : baseUrl;
                        dropdown.addOption(url.trim(), displayText);
                    } else {
                        dropdown.addOption(url.trim(), url.trim());
                    }
                });
                dropdown.setValue(this.plugin.settings.currentBaseUrl)
                dropdown.onChange(async (value) => {
                    await this.saveAndUpdateViews({ currentBaseUrl: value });
                });
            })
            .addButton(button => button
                .setButtonText('编辑列表')
                .onClick(() => {
                    const modal = new ParameterEditModal(
                        this.app,
                        this.plugin,
                        'vendor',
                        this.plugin.settings.currentBaseUrl,
                        async (urls) => {
                            await this.saveAndUpdateViews({
                                baseUrl: urls,
                                currentBaseUrl: urls.length > 0 ? urls[0] : ''
                            });
                            this.display();
                        }
                    );
                    modal.open();
                }));

        // 模型名称设置
        new Setting(containerEl)
            .setName('模型名称')
            .setDesc('选择或编辑模型名称列表')
            .addDropdown(dropdown => {
                dropdown.selectEl.style.width = '240px';  // 添加固定宽度
                this.modelDropdown = dropdown;
                // 确保 model 是数组
                if (!Array.isArray(this.plugin.settings.model)) {
                    this.plugin.settings.model = [this.plugin.settings.model];
                }
                this.plugin.settings.model.forEach(model => {
                    dropdown.addOption(model.trim(), model.trim());
                });
                dropdown.setValue(this.plugin.settings.currentModel)
                dropdown.onChange(async (value) => {
                    await this.saveAndUpdateViews({ currentModel: value });
                });
            })
            .addButton(button => button
                .setButtonText('编辑列表')
                .onClick(() => {
                    const modal = new ParameterEditModal(
                        this.app,
                        this.plugin,
                        'model',
                        this.plugin.settings.currentModel,
                        async (models) => {
                            await this.saveAndUpdateViews({
                                model: models,
                                currentModel: models.length > 0 ? models[0] : ''
                            });
                            this.display();
                        }
                    );
                    modal.open();
                }));

        // 添加自定义配置模块
        new Setting(containerEl)
            .setName('自定义配置')
            .setDesc('创建和管理自定义配置')
            .addButton(button => button
                .setButtonText('添加配置')
                .onClick(() => {
                    const modal = new ConfigEditModal(this.app, this.plugin);
                    modal.open();
                }));

        // 显示自定义配置列表
        const configSectionContainer = containerEl.createDiv({
            cls: 'custom-configs-section',
            attr: {
                style: 'margin-top: 1em; border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 10px;'
            }
        });
        
        // 添加标题
        configSectionContainer.createEl('h3', { 
            text: '配置列表',
            attr: {
                style: 'margin-top: 0; margin-bottom: 10px; font-size: 1em;'
            }
        });
        
        // 自定义配置列表
        if (Array.isArray(this.plugin.settings.customConfigs) && this.plugin.settings.customConfigs.length > 0) {
            const configListContainer = configSectionContainer.createDiv({
                cls: 'custom-configs-list',
                attr: {
                    style: 'max-height: 360px; overflow-y: auto;' // 新增：限制高度并启用滚动
                }
            });
            
            this.plugin.settings.customConfigs.forEach(config => {
                const configItem = configListContainer.createDiv({
                    cls: 'custom-config-item',
                    attr: {
                        style: 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 8px; border-radius: 4px; background: var(--background-primary-alt);'
                    }
                });
                
                // 配置信息区域
                const configInfo = configItem.createDiv({
                    cls: 'custom-config-info',
                    attr: {
                        style: 'flex-grow: 1;'
                    }
                });
                
                configInfo.createEl('span', { 
                    text: config.name,
                    attr: {
                        style: 'font-weight: bold;'
                    }
                });
                
                const configDetails = configInfo.createEl('div', {
                    cls: 'custom-config-details',
                    attr: {
                        style: 'font-size: 0.85em; color: var(--text-muted); margin-top: 4px;'
                    }
                });
                
                configDetails.createEl('div', { 
                    text: `API: ${config.apiKey.substring(0, 15)}...`
                });
                
                configDetails.createEl('div', { 
                    text: `URL: ${config.baseUrl}`
                });
                
                configDetails.createEl('div', { 
                    text: `模型: ${config.model}`
                });
                
                configDetails.createEl('div', { 
                    text: `代理: ${config.useProxy ? '开启' : '关闭'}`
                });
                
                // 配置操作按钮容器
                const configActions = configItem.createDiv({
                    cls: 'custom-config-actions',
                    attr: {
                        style: 'display: flex; gap: 4px;'
                    }
                });
                
                // 应用按钮
                const applyButton = configActions.createEl('button', {
                    text: '应用',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                applyButton.addEventListener('click', async () => {
                    this.plugin.settings.currentApiKey = config.apiKey;
                    this.plugin.settings.currentBaseUrl = config.baseUrl;
                    this.plugin.settings.currentModel = config.model;
                    this.plugin.settings.useProxy = config.useProxy;
                    this.plugin.settings.proxyUrl = config.proxyUrl;
                    this.plugin.settings.currentCustomConfig = config.name;
                    this.plugin.settings.useStreaming = config.useStreaming; // 添加流式模式设置
                    await this.plugin.saveSettings();
                    
                    // new Notice(`已应用配置: ${config.name}`);
                    this.onOpen();
                });
                
                // 编辑按钮
                const editButton = configActions.createEl('button', {
                    text: '编辑',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--interactive-normal); border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                editButton.addEventListener('click', () => {
                    const modal = new ConfigEditModal(this.app, this.plugin, config);
                    modal.open();
                });
                
                // 删除按钮
                const deleteButton = configActions.createEl('button', {
                    text: '删除',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--background-modifier-error); color: white; border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                deleteButton.addEventListener('click', async () => {
                    // 先从DOM中移除当前配置项，实现视觉上的立即反馈
                    configItem.remove();
                    
                    // 从设置中移除该配置
                    this.plugin.settings.customConfigs = this.plugin.settings.customConfigs.filter(c => c.name !== config.name);
                    
                    // 如果删除的是当前选中的配置，重置当前配置
                    if (this.plugin.settings.currentCustomConfig === config.name) {
                        this.plugin.settings.currentCustomConfig = '';
                    }
                    
                    // 保存设置
                    await this.plugin.saveSettings();
                    
                    // 如果删除后没有预设了，显示提示文本
                    if (this.plugin.settings.customConfigs.length === 0) {
                        const configListContainer = configSectionContainer.querySelector('.custom-configs-list');
                        if (configListContainer) configListContainer.remove();
                        
                        configSectionContainer.createEl('p', {
                            text: '尚未创建自定义配置。点击"添加配置"按钮创建一个新配置。',
                            attr: {
                                style: 'color: var(--text-muted); font-style: italic; margin-top: 8px;'
                            }
                        });
                    }
                    
                    // 更新所有打开的ChatView视图
                    this.plugin.updateAllChatViews();
                    
                    new Notice(`配置 "${config.name}" 已删除`);
                });
            });
        } else {
            configSectionContainer.createEl('p', {
                text: '尚未创建自定义配置。点击"添加配置"按钮创建一个新配置。',
                attr: {
                    style: 'color: var(--text-muted); font-style: italic; margin-top: 8px;'
                }
            });
        }

        // 重置对话按钮
        new Setting(containerEl)
            .setName('重置对话')
            .setDesc('清除当前所有对话记录。')
            .addButton(button => button
                .setButtonText('重置')
                .setWarning()
                .onClick(() => {
                    if (confirm('确定要清除所有对话记录吗？')) {
                        this.plugin.clearChatHistory();
                        new Notice('对话记录已清除');
                    }
                }));

        // 新增设置选项：是否自动清空记录
        new Setting(containerEl)
            .setName('自动清空记录')
            .setDesc('每次重启面板时自动保存当前对话记录并清空对话窗口。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoClearOnRestart)
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ autoClearOnRestart: value });
                }));

        // 添加自动聚焦设置
        new Setting(containerEl)
            .setName('自动聚焦')
            .setDesc('打开面板时自动聚焦到输入框')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoFocus)
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ autoFocus: value });
                }));

        // 新增专注模式开关
        new Setting(containerEl)
            .setName('专注模式')
            .setDesc('打开后，面板上方按钮和选择参数行只有在鼠标悬浮时才会显示。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.focusMode)
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ focusMode: value });
                }));

        // 添加字体大小设置
        new Setting(containerEl)
            .setName('字体大小')
            .setDesc('设置对话界面的字体大小（也可以在对话界面使用 Ctrl + 滚轮调整）')
            .addSlider(slider => slider
                .setLimits(8, 32, 1)
                .setValue(this.plugin.settings.fontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ fontSize: value });
                }));

        // 添加历史记录路径设置
        new Setting(containerEl)
            .setName('历史记录路径')
            .setDesc('设置对话历史记录的存放路径（例如：AI/历史记录）')
            .addText(text => {
                text.setPlaceholder('输入历史记录存放路径')
                    .setValue(this.plugin.settings.historyPath)
                    .onChange(async (value) => {
                        // 移除开头的斜杠
                        value = value.replace(/^\/+/, '');
                        // 移除结尾的斜杠
                        value = value.replace(/\/+$/, '');
                        
                        this.plugin.settings.historyPath = value;
                        // 更新临时文件路径
                        this.plugin.settings.tempHistoryFile = value ? `${value}/临时对话.md` : '';
                        await this.plugin.saveSettings();
                        
                        // 确保文件夹存在
                        if (value) {
                            try {
                                const folder = this.plugin.app.vault.getAbstractFileByPath(value);
                                if (!(folder instanceof TFolder)) {
                                    await this.plugin.app.vault.createFolder(value);
                                }
                            } catch (error) {
                                console.error('创建历史记录文件夹失败:', error);
                                new Notice('创建历史记录文件夹失败，请检查路径是否合法');
                            }
                        }
                    });
            })
            .addExtraButton(button => {
                button
                    .setIcon('folder')
                    .setTooltip('选择文件夹')
                    .onClick(async () => {
                        // 创建文件夹选择模态框
                        new FolderSuggestModal(this.app, async (folder) => {
                            const path = folder.path;
                            this.plugin.settings.historyPath = path;
                            this.plugin.settings.tempHistoryFile = `${path}/临时对话.md`;
                            await this.plugin.saveSettings();
                            this.display(); // 这里保持 display，因为 SettingsTab 类中有这个方法
                        }).open();
                    });
            });

        // 添加温度滑块设置
        new Setting(containerEl)
            .setName('模型温度')
            .setDesc('控制AI回复的随机性(0-2)。较低的值会使回复更加确定,较高的值会使回复更加随机和创造性。')
            .addSlider(slider => slider
                .setLimits(0, 2, 0.1)
                .setValue(this.plugin.settings.temperature)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ temperature: value });
                }));

        // 添加流式模式开关设置
        new Setting(containerEl)
            .setName('流式输出')
            .setDesc('开启后AI回复将实时逐字显示，关闭后等待完整回复后一次性显示')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useStreaming)
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ useStreaming: value });
                }));

        // 添加代理开关设置
        new Setting(containerEl)
            .setName('使用代理')
            .setDesc('开启后将通过代理服务器发送请求')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useProxy)
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ useProxy: value });
                }));

        // 添加代理地址设置
        new Setting(containerEl)
            .setName('代理服务器地址')
            .setDesc('设置代理服务器的地址')
            .addText(text => text
                .setPlaceholder('http://example.com/proxy')
                .setValue(this.plugin.settings.proxyUrl)
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ proxyUrl: value });
                }));

        // 添加 System Message 设置
        new Setting(containerEl)
            .setName('System Message')
            .setDesc('设置AI的角色定位和行为准则')
            .addDropdown(dropdown => {
                dropdown.selectEl.style.width = '240px';  // 添加固定宽度
                // 添加选项到下拉菜单
                this.plugin.settings.systemMessages.forEach(msg => {
                    dropdown.addOption(msg.trim(), msg.trim());
                });
                dropdown.setValue(this.plugin.settings.currentSystemMessage)
                dropdown.onChange(async (value) => {
                    this.plugin.settings.currentSystemMessage = value;
                    await this.plugin.saveSettings();
                });
            })
            .addButton(button => button
                .setButtonText('编辑列表')
                .onClick(() => {
                    const modal = new TextEditModal(
                        this.app,
                        '编辑System Message列表',
                        Array.isArray(this.plugin.settings.systemMessages)
                            ? this.plugin.settings.systemMessages.join('\n')
                            : this.plugin.settings.systemMessages,
                        async (result) => {
                            const messages = result.split('\n').filter(line => line.trim());
                            this.plugin.settings.systemMessages = messages;
                            this.plugin.settings.currentSystemMessage = messages.length > 0 ? messages[0] : '';
                            await this.plugin.saveSettings();
                            this.onOpen();
                        }
                    );
                    modal.open();
                }));



        // 添加自动清空功能
        new Setting(containerEl)
            .setName('开启自动清空')
            .setDesc('每次启动Obsidian时清空上次的对话，但会保存到历史记录')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.autoClearOnRestart)
                    .onChange(async (value) => {
                        await this.saveAndUpdateViews({
                            autoClearOnRestart: value
                        });
                    });
            });
            
        // 添加历史面板显示选项
        new Setting(containerEl)
            .setName('默认显示历史面板')
            .setDesc('是否在打开对话窗口时默认显示左侧历史面板')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showHistoryPanel)
                    .onChange(async (value) => {
                        await this.saveAndUpdateViews({
                            showHistoryPanel: value
                        });
                        
                        // 更新所有打开的聊天视图的历史面板显示状态
                        this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
                            if (leaf.view instanceof ChatView) {
                                const historyPanelToggle = leaf.view.containerEl.querySelector('.history-panel-toggle');
                                if (historyPanelToggle) {
                                    historyPanelToggle.textContent = value ? '隐藏历史' : '显示历史';
                                }
                                
                                if (leaf.view.leftPanel) {
                                    leaf.view.leftPanel.style.display = value ? 'flex' : 'none';
                                }
                            }
                        });
                    });
            });

        // 添加点击配置时自动新建对话选项
        new Setting(containerEl)
            .setName('点击配置时自动新建对话')
            .setDesc('点击配置元素时自动执行新建对话操作并聚焦到输入框')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.clickConfigAutoNew)
                    .onChange(async (value) => {
                        await this.saveAndUpdateViews({
                            clickConfigAutoNew: value
                        });
                    });
            });
            
        // 添加紧凑配置视图选项
        new Setting(containerEl)
            .setName('紧凑配置视图')
            .setDesc('开启后，配置按钮区域只显示一行，鼠标悬停时展开完整内容')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.compactConfigView)
                    .onChange(async (value) => {
                        await this.saveAndUpdateViews({
                            compactConfigView: value
                        });
                    });
            });
            
                // 添加切换历史记录后自动滚动到底部选项
        new Setting(containerEl)
            .setName('切换历史记录后自动滚动到底部')
            .setDesc('使用Alt+方向上下键切换历史记录时，自动滚动到对话底部')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.autoScrollAfterHistorySwitch)
                    .onChange(async (value) => {
                        await this.saveAndUpdateViews({
                            autoScrollAfterHistorySwitch: value
                        });
                    });
            });

        // 添加请求参数日志开关选项
        new Setting(containerEl)
            .setName('请求参数日志')
            .setDesc('开启后，每次请求的所有参数将在控制台打印')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.logRequestParams)
                    .onChange(async (value) => {
                        await this.saveAndUpdateViews({
                            logRequestParams: value
                        });
                    });
            });
            
        // 添加显示滚动按钮选项
        new Setting(containerEl)
            .setName('显示滚动按钮')
            .setDesc('在对话面板右侧显示滚动到顶部/底部的按钮')
            .addToggle(toggle => {
                toggle
                    .setValue(this.plugin.settings.showScrollButtons)
                    .onChange(async (value) => {
                        await this.saveAndUpdateViews({
                            showScrollButtons: value
                        });
                    });
            });
            
        // 添加滚动按钮透明度滑块
        new Setting(containerEl)
            .setName('滚动按钮透明度')
            .setDesc('设置滚动按钮的默认透明度（1-100）')
            .addSlider(slider => slider
                .setLimits(1, 100, 1)
                .setValue(this.plugin.settings.scrollButtonsOpacity)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({
                        scrollButtonsOpacity: value
                    });
                }));
 
        // 添加重试模块
        new Setting(containerEl)
            .setName('重试模块')
            .setDesc('失败后最大自动重试次数，并实现功能，每次失败在控制台打印相关记录')
            .addSlider(slider => slider
                .setLimits(0, 10, 1)
                .setValue(this.plugin.settings.maxRetryAttempts)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ maxRetryAttempts: value });
                }));
                
        // 添加最大补全长度设置
        new Setting(containerEl)
            .setName('最大补全长度')
            .setDesc('控制AI回复的最大标记数量，较大的值可能导致更长的回复，但也可能增加API费用')
            .addSlider(slider => slider
                .setLimits(100, 16000, 100)
                .setValue(this.plugin.settings.maxTokens)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    await this.saveAndUpdateViews({ maxTokens: value });
                }));
    }
}

// 主插件类
module.exports = class CallAIChatPlugin extends Plugin {
    async onload() {
        // 加载和应用默认设置
        await this.loadSettings();

        // 启动时检查并创建历史记录目录
        await this.ensureHistoryFolderOnStartup();
    
        // 注册自定义视图，添加 navigation 属性为 false
        this.registerView(
            CHAT_VIEW_TYPE,
            (leaf) => new ChatView(leaf, this),
            {
                navigation: false  // 这会让视图默认在主区域打开，而不是在左侧导航面板
            }
        );
    
        // 添加命令：打开对话AI
        this.addCommand({
            id: 'open-chat-ai',
            name: '打开对话AI',
            callback: () => {
                this.activateChatView();
            },
        });
    
        // 新增命令：快速唤醒ai
        this.addCommand({
            id: 'quick-wake-ai',
            name: '快速唤醒ai',
            callback: async () => {
                // 打开一个新的悬浮窗口作为 popout
                const popoutLeaf = this.app.workspace.openPopoutLeaf();
        
                // 设置视图类型为自定义的 CHAT_VIEW_TYPE
                await popoutLeaf.setViewState({ type: CHAT_VIEW_TYPE });
        
                // 将该对话面板置顶固定
                popoutLeaf.setPinned(true);
        
                // 显示该弹出叶子窗口
                this.app.workspace.revealLeaf(popoutLeaf);
        
                // 获取已加载的 ChatView 实例，并自动聚焦到输入框
                const view = popoutLeaf.view;
                if (view && view.textarea && this.settings.autoFocus) {
                    view.textarea.focus();
                }
            },
        }); 
    
        // 添加设置选项卡
        this.setting = new CallAIChatSettingsTab(this.app, this);
        this.addSettingTab(this.setting);
    
        // 添加样式
        this.addStyle();

        // 添加快捷键命令：恢复更早的对话记录
        this.addCommand({
            id: 'restore-previous-chat',
            name: '恢复更早的对话记录',
            hotkeys: [{ modifiers: ['Alt'], key: 'ArrowUp' }],
            callback: async () => {
                const files = await this.getHistoryFiles();
                if (files.length === 0) {
                    new Notice('没有找到历史对话记录');
                    return;
                }

                const currentIndex = files.findIndex(f => f.path === this.settings.currentHistoryFile);
                const nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, files.length - 1);
                
                if (nextIndex !== currentIndex) {
                    await this.loadHistoryFile(files[nextIndex]);
                    
                    // 在所有打开的ChatView中滚动到底部
                    if (this.settings.autoScrollAfterHistorySwitch) {
                        this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
                            if (leaf.view instanceof ChatView) {
                                leaf.view.scrollToBottom();
                            }
                        });
                    }
                } else {
                    new Notice('已经是最早的对话记录了');
                }
            }
        });

        // 添加快捷键命令：恢复更新的对话记录
        this.addCommand({
            id: 'restore-next-chat',
            name: '恢复更新的对话记录',
            hotkeys: [{ modifiers: ['Alt'], key: 'ArrowDown' }],
            callback: async () => {
                const files = await this.getHistoryFiles();
                if (files.length === 0) {
                    new Notice('没有找到历史对话记录');
                    return;
                }

                const currentIndex = files.findIndex(f => f.path === this.settings.currentHistoryFile);
                const nextIndex = currentIndex === -1 ? 0 : Math.max(currentIndex - 1, 0);
                
                if (nextIndex !== currentIndex) {
                    await this.loadHistoryFile(files[nextIndex]);
                    
                    // 在所有打开的ChatView中滚动到底部
                    if (this.settings.autoScrollAfterHistorySwitch) {
                        this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
                            if (leaf.view instanceof ChatView) {
                                leaf.view.scrollToBottom();
                            }
                        });
                    }
                } else {
                    new Notice('已经是最新的对话记录了');
                }
            }
        });

        // 在 onload() 方法中添加新命令，在其他命令的注册之后
        this.addCommand({
            id: 'quick-new-chat',
            name: '快速新建',
            callback: async () => {
                // 获取所有打开的聊天视图
                const chatLeaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
                
                if (chatLeaves.length > 0) {
                    // 如果有打开的聊天视图，对每个视图执行新建操作
                    for (const leaf of chatLeaves) {
                        const view = leaf.view;
                        if (view instanceof ChatView) {
                            await view.handleNewConversation();
                        }
                    }
                } else {
                    // 如果没有打开的聊天视图，先打开一个新的视图
                    const leaf = await this.activateChatView();
                    // 等待视图加载完成后执行新建操作
                    setTimeout(async () => {
                        const view = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]?.view;
                        if (view instanceof ChatView) {
                            await view.handleNewConversation();
                        }
                    }, 100);
                }
            }
        });

        // 新增命令：复制对话
        this.addCommand({
            id: 'copy-current-chat',
            name: '复制对话',
            callback: async () => {
                // 尝试获取当前激活的聊天视图
                let view = typeof this.app.workspace.getActiveViewOfType === 'function' ? this.app.workspace.getActiveViewOfType(ChatView) : null;
                if (!view) {
                    // 如果当前激活视图不是 ChatView，则尝试获取首个 ChatView
                    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
                    if (leaf && leaf.view instanceof ChatView) {
                        view = leaf.view;
                    }
                }

                if (!(view instanceof ChatView)) {
                    new Notice('未找到聊天对话面板');
                    return;
                }

                if (view.messages.length === 0) {
                    new Notice('当前对话为空，无法复制');
                    return;
                }

                // 1. 将当前对话保存为新的历史文件
                await this.saveChatHistoryToFile(view.messages);

                // 2. 读取并加载刚刚保存的历史文件
                const newFilePath = this.settings.currentHistoryFile;
                const file = this.app.vault.getAbstractFileByPath(newFilePath);
                if (file instanceof TFile) {
                    await this.loadHistoryFile(file);
                    new Notice('已将当前对话复制为新的历史记录');
                } else {
                    new Notice('复制对话失败：无法定位新建历史文件');
                }
            }
        });
    }

    onunload() {
        // 插件卸载时的清理
        this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach((leaf) => leaf.detach());
    }

    async activateChatView() {
        // 先尝试找到已经存在的聊天视图
        let leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
        
        if (!leaf) {
            // 如果没有已存在的视图，在右侧边栏创建新的
            leaf = this.app.workspace.getRightLeaf(false);
            await leaf.setViewState({ 
                type: CHAT_VIEW_TYPE,
                active: true  // 确保新视图会被激活
            });
        }
        
        // 确保侧边栏是展开的
        if (!this.app.workspace.rightSplit.collapsed) {
            this.app.workspace.rightSplit.expand();
        }
        
        // 激活视图
        this.app.workspace.revealLeaf(leaf);
        return leaf;
    }

    async loadSettings() {
        const DEFAULT_SETTINGS = {
            apiKey: [],
            currentApiKey: '',
            baseUrl: [],
            currentBaseUrl: 'https://api.openai.com/v1',
            model: [],
            currentModel: 'gpt-3.5-turbo',
            temperature: 0.7,
            systemMessage: '你是一个有用的助手。',
            useProxy: false,
            proxyUrl: 'http://localhost:7890',
            chatHistory: [],
            historyPath: '',
            autoClearOnRestart: false,
            tempHistoryFile: '',
            currentHistoryFile: '',
            systemMessagePath: '',
            systemMessageFiles: [],
            currentSystemMessage: '',
            currentSystemMessageFile: '',
            customConfigs: [],
            currentCustomConfig: '',
            starredHistoryFiles: [],
            fontSize: 16,
            showHistoryPanel: false, // 添加历史面板显示状态选项，默认隐藏
            clickConfigAutoNew: false, // 点击配置时自动新建对话并聚焦到输入框
            useStreaming: true, // 添加流式模式开关，默认开启
            compactConfigView: false, // 紧凑配置视图，默认关闭
            maxRetryAttempts: 3, // 最大自动重试次数
            maxTokens: 10000, // 添加最大补全长度设置，默认10000
            autoScrollAfterHistorySwitch: true, // 切换历史记录后自动滚动到底部，默认开启
            showScrollButtons: true,
            logRequestParams: false // 添加请求参数日志开关，默认关闭
        };

        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(skipViewUpdate = false) {
        await this.saveData(this.settings);
        // 在保存设置后更新所有打开的对话视图
        if (!skipViewUpdate) {
            this.updateAllChatViews();
        }
    }

    updateAllChatViews(skipScroll = false) {
        this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
            if (leaf.view instanceof ChatView) {
                leaf.view.updateDropdowns();
                leaf.view.renderConfigButtons(); // 更新配置按钮
                leaf.view.applyCompactConfigView(); // 应用紧凑视图设置
                
                // 更新消息并处理滚动
                leaf.view.messages = [...this.settings.chatHistory];
                leaf.view.renderMessages(skipScroll);
                
                // 如果不跳过滚动，确保滚动到底部
                if (!skipScroll) {
                    setTimeout(() => {
                        leaf.view.scrollToBottom();
                    }, 100);
                }
            }
        });
    }

    clearChatHistory() {
        this.settings.chatHistory = [];
        this.settings.currentHistoryFile = '';
        this.saveSettings();
        // 重新加载所有 ChatView 实例的消息
        this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
            const view = leaf.view;
            if (view instanceof ChatView) {
                view.messages = [];
                view.messagesContainer.empty();
            }
        });
    }

    addStyle() {
        // 这里可以添加全局样式，如果需要的话
    }

    // 启动时检查并创建历史记录目录
    async ensureHistoryFolderOnStartup() {
        const historyPath = this.settings.historyPath;
        if (!historyPath) return; // 如果没有配置路径，直接返回

        const folder = this.app.vault.getAbstractFileByPath(historyPath);
        if (!(folder instanceof TFolder)) {
            try {
                await this.app.vault.createFolder(historyPath);
                console.log('启动时创建历史记录文件夹:', historyPath);
            } catch (error) {
                console.error('启动时创建历史记录文件夹失败:', error);
            }
        }
    }

    // 新增：保存聊天历史到文件
    async saveChatHistoryToFile(chatHistory) {
        if (!this.settings.historyPath) {
            new Notice('请先在设置中配置历史记录存放路径');
            return;
        }

        let folder = this.app.vault.getAbstractFileByPath(this.settings.historyPath);
        if (!(folder instanceof TFolder)) {
            try {
                folder = await this.app.vault.createFolder(this.settings.historyPath);
            } catch (error) {
                console.error('创建历史记录文件夹失败:', error);
                new Notice('创建历史记录文件夹失败，请检查路径是否合法');
                return;
            }
        }

        // 生成时间戳
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T').join('_').split('Z')[0];
        const filename = `${timestamp}.md`;
        const filePath = `${this.settings.historyPath}/${filename}`;

        // 格式化内容为Markdown
        let content = '';
        chatHistory.forEach(msg => {
            let timeStr = 'Time N/A'; // 默认时间占位符
            if (msg.time) { // 检查 msg.time 是否存在
                try {
                    // 尝试将 msg.time 转换为 Date 对象（如果它还不是）
                    const dateObject = msg.time instanceof Date ? msg.time : new Date(msg.time);
                    
                    // 检查转换后的对象是否是有效的 Date
                    if (dateObject instanceof Date && !isNaN(dateObject.getTime())) {
                        timeStr = dateObject.toLocaleTimeString(); 
                    } else {
                        console.warn("保存历史记录时遇到无效的时间格式:", msg.time);
                        // 如果原始值是字符串，可以考虑显示原始字符串
                        if (typeof msg.time === 'string') {
                           timeStr = `Invalid (${msg.time})`;
                        }
                    }
                } catch (e) {
                     console.error("处理消息时间时出错:", msg.time, e);
                     if (typeof msg.time === 'string') {
                           timeStr = `Error (${msg.time})`;
                     } else {
                           timeStr = '处理时间出错';
                     }
                }
            }
             const speaker = msg.role === 'user' ? '你' : 'AI';
            content += `### ${speaker} (${timeStr})\n\n${msg.content}\n\n`;
        });

        // 创建并写入文件
        await this.app.vault.create(filePath, content);

        // 更新当前历史文件路径
        this.settings.currentHistoryFile = filePath;
        await this.saveSettings();
    }

    // 新增：加载最新聊天历史文件
    async loadLatestChatHistory() {
        const historyFolderPath = 'A重要文件/ai历史记录';
        let folder = this.app.vault.getAbstractFileByPath(historyFolderPath);
        if (!(folder instanceof TFolder)) {
            // 文件夹不存在，创建它
            folder = await this.app.vault.createFolder(historyFolderPath);
            this.settings.chatHistory = [];
            await this.saveSettings();
            return;
        }

        const files = this.app.vault.getFiles().filter(file => file.path.startsWith(historyFolderPath) && file.extension === 'md');
        if (files.length === 0) {
            // 没历史文件，开始新的对话
            this.settings.chatHistory = [];
            await this.saveSettings();
            return;
        }

        // 按照修改时间降序排序，获取最新的文件
        files.sort((a, b) => b.stat.mtime - a.stat.mtime);
        const latestFile = files[0];
        try {
            const content = await this.app.vault.read(latestFile);
            this.settings.currentHistoryFile = latestFile.path;
            this.settings.chatHistory = this.parseMarkdownToChatHistory(content);
            await this.saveSettings();
        } catch (error) {
            console.error('加载最新历史文件时出错:', error);
            new Notice('加载历史对话时出错');
            this.settings.chatHistory = [];
            await this.saveSettings();
        }
    }

    // 新增：解析Markdown内容到chatHistory
    parseMarkdownToChatHistory(content) {
        const lines = content.split('\n');
        const chatHistory = [];
        let currentRole = null;
        let currentTime = null;
        let currentContent = [];

        lines.forEach(line => {
            const roleMatch = line.match(/^###\s*(你|AI)\s*\((\d{1,2}:\d{2}:\d{2})\)/);
            if (roleMatch) {
                // 保存之前的消息
                if (currentRole && currentContent.length > 0) {
                    chatHistory.push({
                        role: currentRole === '你' ? 'user' : 'assistant',
                        content: currentContent.join('\n'),
                        time: new Date(`1970-01-01T${currentTime}Z`) // 使用UTC时间
                    });
                }
                // 开始新的消息
                currentRole = roleMatch[1];
                currentTime = roleMatch[2];
                currentContent = [];
            } else {
                if (currentRole) {
                    currentContent.push(line);
                }
            }
        });

        // 保存最后一条消息
        if (currentRole && currentContent.length > 0) {
            chatHistory.push({
                role: currentRole === '你' ? 'user' : 'assistant',
                content: currentContent.join('\n'),
                time: new Date(`1970-01-01T${currentTime}Z`)
            });
        }

        return chatHistory;
    }

    // 添加新方法用于获取历史文件列表
    async getHistoryFiles() {
        if (!this.settings.historyPath) {
            return [];
        }

        const folder = this.app.vault.getAbstractFileByPath(this.settings.historyPath);
        if (!(folder instanceof TFolder)) {
            return [];
        }

        const files = this.app.vault.getFiles()
            .filter(file => file.path.startsWith(this.settings.historyPath) && file.extension === 'md')
            .sort((a, b) => b.stat.mtime - a.stat.mtime);

        return files;
    }

    // 添加新方法用于加载指定的历史文件
    async loadHistoryFile(file) {
        try {
            const content = await this.app.vault.read(file);
            this.settings.currentHistoryFile = file.path;
            this.settings.chatHistory = this.parseMarkdownToChatHistory(content);
            await this.saveSettings();

            // 更新所有打开的聊天视图
            this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).forEach(leaf => {
                if (leaf.view instanceof ChatView) {
                    leaf.view.messages = [...this.settings.chatHistory];
                    
                    // 强制滚动到底部，不考虑autoScrollAfterHistorySwitch设置
                    // 这样可以确保切换历史记录后总是滚动到底部
                    leaf.view.renderMessages(false);
                    
                    // 确保滚动到底部
                    setTimeout(() => {
                        leaf.view.scrollToBottom();
                    }, 100);
                }
            });

            new Notice(`已恢复 ${file.basename} 的对话记录`);
        } catch (error) {
            console.error('加载历史文件时出错:', error);
            new Notice('加载历史对话时出错');
        }
    }
}

// 添加样式
const style = document.createElement('style');
style.textContent = `
    /* 修改专注模式样式 - 保持控件可用性 */
    .focus-mode .nav-header,
    .focus-mode .nav-buttons-container,
    .focus-mode .header-dropdowns {
        opacity: 0.3;
        transition: opacity 0.3s ease;
        pointer-events: auto;
    }

    .focus-mode .nav-header:hover,
    .focus-mode .nav-buttons-container:hover,
    .focus-mode .header-dropdowns:hover {
        opacity: 1;
    }

    /* 确保控件始终可点击 */
    .focus-mode .nav-buttons-container *,
    .focus-mode .header-dropdowns * {
        pointer-events: auto;
    }

    /* 现有样式... */
    
    .chat-ai-container {
        font-size: var(--chat-font-size, 14px);
    }
    
    .chat-ai-message {
        font-size: var(--chat-font-size, 14px);
    }
    
    .chat-ai-textarea {
        font-size: var(--chat-font-size, 14px);
    }

    .chat-ai-container {
        background-color: transparent;
        color: var(--text-normal);
    }

    .chat-ai-messages {
        background-color: rgba(var(--background-primary-rgb), 0.8);
        border-bottom: 1px solid var(--background-modifier-border);
        backdrop-filter: blur(10px);
    }

    .chat-ai-message {
        background-color: rgba(var(--background-primary-alt-rgb), 0.9);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
        backdrop-filter: blur(5px);
    }

    .chat-ai-message.user {
        background-color: rgba(var(--background-secondary-alt-rgb), 0.9);
    }

    .chat-ai-message.assistant {
        background-color: var(--background-primary-alt);
    }

    .chat-ai-input-area {
        background-color: var(--background-primary);
        border-top: 1px solid var(--divider-color);
    }

    .chat-ai-textarea {
        background-color: var(--background-primary-alt);
        border: 1px solid var(--background-modifier-border);
        outline: none;
        box-shadow: none;
        color: var(--text-normal);
    }

    .chat-ai-textarea:focus {
        border: var(--input-border-width, 1px) solid var(--background-modifier-border-hover);
        outline: none;
        box-shadow: none;
    }

    .chat-ai-send-button {
        background-color: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    .chat-ai-send-button:hover {
        background-color: var(--interactive-accent-hover);
    }

    .chat-ai-header {
        background-color: var(--background-primary);
        border-bottom: 1px solid var(--background-modifier-border);
    }

    .chat-ai-header-button {
        background-color: var(--background-primary-alt);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
    }

    .chat-ai-header-button:hover {
        background-color: var(--background-modifier-hover);
    }

    .header-dropdowns select {
        background-color: var(--background-primary-alt);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
    }

    .header-dropdowns select:hover {
        background-color: var(--background-modifier-hover);
    }

    .chat-ai-image-preview {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 8px;
        background: transparent;
        min-height: 50px;
        margin-bottom: 8px;
        width: 100%;
        box-sizing: border-box;
        border: none;
    }

    .chat-ai-upload-button {
        background-color: var(--interactive-accent) !important;
        color: var(--text-on-accent);
    }

    .chat-ai-upload-button:hover {
        background-color: var(--interactive-accent-hover) !important;
    }

    pre.code-block {
        background-color: var(--code-background);
        border: 1px solid var(--background-modifier-border);
    }

    .code-copy-button {
        background-color: var(--interactive-accent);
        color: var(--text-on-accent);
    }

    .code-copy-button:hover {
        background-color: var(--interactive-accent-hover);
    }

    /* 代码块样式优化 - 修复超出消息气泡的问题 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message pre {
        max-width: 100%;
        width: 100%;
        overflow-x: auto;
        white-space: pre-wrap;
        word-wrap: break-word;
        word-break: break-all;
        box-sizing: border-box;
        margin: 8px 0;
        padding: 12px;
        background-color: var(--code-background);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--radius-s);
        font-family: var(--font-monospace);
        font-size: 0.9em;
        line-height: 1.4;
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message code {
        font-family: var(--font-monospace);
        background-color: var(--code-background);
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 0.9em;
        word-break: break-all;
    }

    /* 行内代码样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message p code {
        background-color: var(--code-background);
        padding: 2px 4px;
        border-radius: 3px;
        border: 1px solid var(--background-modifier-border);
    }

    /* 代码块内容换行控制 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message pre code {
        background: transparent;
        padding: 0;
        border: none;
        white-space: pre-wrap;
        word-wrap: break-word;
        word-break: break-all;
        display: block;
        width: 100%;
    }

    /* 表格样式优化 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message table {
        max-width: 100%;
        width: 100%;
        table-layout: auto;
        border-collapse: collapse;
        margin: 8px 0;
        overflow-x: auto;
        display: block;
        white-space: nowrap;
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message thead,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message tbody,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message tr {
        display: table;
        width: 100%;
        table-layout: fixed;
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message th,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message td {
        word-break: break-word;
        word-wrap: break-word;
        overflow-wrap: break-word;
        padding: 8px;
        border: 1px solid var(--background-modifier-border);
        max-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* 长链接和URL的换行处理 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message a {
        word-break: break-all;
        overflow-wrap: break-word;
    }

    /* 其他元素的换行优化 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message p,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message div,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message span,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message li {
        word-break: break-word;
        word-wrap: break-word;
        overflow-wrap: break-word;
        max-width: 100%;
    }

    .select-tooltip {
        background-color: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
    }

    /* ... 其他样式保持不变 ... */

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] {
        display: flex;
        flex-direction: column;
        height: 100%;
        background-color: var(--background-primary); // 整个面板使用主背景色
    }

  
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-messages {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 16px;
        background: transparent; // 移除背景色，使用父元素背景
        position: relative;
    }

    /* 输入区域容器样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-input-area {
        flex: 0 0 auto !important; // 改为auto，允许动态调整高度
        border-top: 1px solid var(--divider-color);
        background: transparent;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        height: 120px !important; // 保持初始高度
        min-height: 80px !important; // 允许最小高度
        max-height: 400px !important; // 允许最大高度
        box-sizing: border-box;
        overflow: hidden; // 防止内容溢出
        resize: none; // 禁用浏览器默认的resize行为
    }

    /* 输入框样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-textarea {
        width: 100%;
        resize: none;
        background-color: rgba(var(--background-primary-rgb), 0.2);
        color: var(--text-normal);
        border: 1px solid var(--background-modifier-border);
        outline: none;
        box-shadow: none;
        border-radius: var(--radius-s);
        padding: 8px 12px;
        line-height: 1.5;
        height: 80px !important; // 使用固定高度
        max-height: 80px !important;
        min-height: 80px !important;
        box-sizing: border-box;
        overflow-y: auto;
        font-size: inherit; // 继承父元素的字体大小
    }

    /* 按钮容器样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .input-button-container {
        flex: 0 0 32px; // 固定高度
        display: flex;
        gap: 8px;
        height: 32px !important;
    }

    /* 添加占位符文本的样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-textarea::placeholder {
        color: var(--text-muted);
        opacity: 0.6;
        font-weight: 400;
    }

    /* 输入框基础状态 - 固定边框和阴影避免偏移 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-textarea {
        border: var(--input-border-width, 1px) solid var(--background-modifier-border);
        outline: none;
        box-shadow: none;
        transition: border-color 0.15s ease-in-out;
        /* 防止布局偏移 */
        transform: translateZ(0);
        backface-visibility: hidden;
    }

    /* 输入框焦点状态 - 只改变边框颜色 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-textarea:focus {
        border-color: var(--background-modifier-border-hover);
        outline: none;
        box-shadow: none;
    }

    /* 输入框悬停状态 - 只改变边框颜色 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-textarea:hover {
        border-color: var(--background-modifier-border-hover);
        outline: none;
        box-shadow: none;
    }

    /* 基础消息样式 - 所有消息共用 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message {
        background-color: rgba(var(--background-primary-alt-rgb), 0.3);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--radius-m);
        padding: 8px 12px 24px 12px;
        margin-bottom: 8px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
        position: relative;
        max-width: 85%;
        width: max-content;
        min-width: 2em;
        margin-left: 8px;
        margin-right: auto;
        user-select: text; /* 确保文字可以被选中 */
    }

    /* 用户消息位置样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message[data-role="user"] {
        margin-left: auto;
        margin-right: 8px;
    }

    /* 助手消息位置样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message[data-role="assistant"] {
        margin-left: 8px;
        margin-right: auto;
    }

    /* 消息内容文字样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message .message-content {
        color: var(--text-normal);
        word-break: break-word;
        word-wrap: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
        max-width: 100%;
        width: 100%;
        box-sizing: border-box;
        user-select: text; /* 允许选中 */
    }

    /* 为亮色模式单独设置颜色 */
    body:not(.theme-dark) .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message .message-content {
        color: #000000; /* 亮色模式下使用纯黑色 */
    }

    /* 时间戳和复制按钮容器 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .message-bottom {
        display: flex;
        justify-content: flex-end; // 右对齐
        align-items: center;
        gap: 8px; // 添加间距
        position: absolute; // 绝对定位
        bottom: 2px; // 进一步减小底部距离
        right: 12px; // 距离右侧12px
    }

    /* 时间戳样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .timestamp {
        font-size: 0.8em;
        opacity: 0.4; // 降低透明度，使颜色更淡
        color: var(--text-faint); // 使用更淡的文本颜色
    }

    /* 复制按钮和刷新按钮的统一基础样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-copy-button,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-refresh-button,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-edit-button {
        opacity: 0; // 默认完全隐藏
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: opacity 200ms ease;
        padding: 0;
        color: var(--text-muted); /* 确保图标颜色与时间戳协调 */
    }

    /* 复制/刷新/编辑按钮内的SVG图标大小 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-copy-button svg,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-refresh-button svg,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-edit-button svg {
        width: 14px;
        height: 14px;
    }

    /* 鼠标悬停在消息容器上时显示复制/刷新/编辑按钮 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message:hover .chat-ai-copy-button,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message:hover .chat-ai-refresh-button,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-message:hover .chat-ai-edit-button {
        opacity: 0.6; /* 悬停时透明度略高 */
    }

    /* 鼠标悬停在复制/刷新/编辑按钮本身上时的样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-copy-button:hover,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-refresh-button:hover,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-edit-button:hover {
        opacity: 1; /* 完全不透明 */
        color: var(--text-normal); /* 悬停时图标颜色更明显 */
    }

    /* 滚动条样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] ::-webkit-scrollbar {
        width: var(--scrollbar-width);
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] ::-webkit-scrollbar-thumb {
        background-color: var(--scrollbar-thumb-bg);
        border: var(--scrollbar-thumb-border-width) solid transparent;
        border-radius: var(--scrollbar-thumb-radius);
        background-clip: padding-box;
    }

    /* 按钮样式统一 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-header-button {
        background-color: var(--interactive-normal);
        color: var(--text-normal);
        border: none;
        border-radius: var(--radius-s);
        padding: 4px 8px;
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        transition: background-color 0.1s ease;
        opacity: 0.6; // 添加60%透明度
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-send-button {
        background-color: var(--interactive-normal);
        color: var(--text-normal);
        border: none;
        border-radius: var(--radius-s);
        padding: 4px 8px;
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        transition: background-color 0.1s ease;
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-header-button:hover,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-send-button:hover {
        background-color: var(--interactive-hover);
    }

    /* 下拉菜单样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .header-dropdowns select {
        background-color: var(--background-primary);
        color: var(--text-normal);
        border: var(--input-border-width) solid var(--background-modifier-border);
        border-radius: var(--radius-s);
        padding: 2px 4px;
        font-size: var(--font-ui-smaller);
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .header-dropdowns select:hover {
        background-color: var(--background-modifier-form-field-highlighted);
    }

    /* 复制按钮样式调整 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-copy-button {
        opacity: 0.5; // 添加50%透明度
        width: 16px; // 缩小按钮大小
        height: 16px; // 缩小按钮大小
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        cursor: pointer;
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-copy-button svg {
        width: 14px; // 缩小图标大小
        height: 14px; // 缩小图标大小
    }

    /* 输入框样式调整 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-textarea {
        width: 100%;
        resize: none;
        background-color: rgba(var(--background-primary-rgb), 0.2);
        color: var(--text-normal);  // 保持文字颜色完全不透明
        border: 1px solid var(--background-modifier-border);
        outline: none;
        box-shadow: none;
        border-radius: var(--radius-s);
        padding: 8px 12px;
        line-height: var(--line-height-tight);
        min-height: 40px;
        /* 删除整体opacity设置 */
        /* 防止悬停偏移和闪烁 */
        transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
        transform: translateZ(0);
        backface-visibility: hidden;
        will-change: border-color;
    }

    /* 发送和图片上传按钮样式调整 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-send-button,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-upload-button {
        background-color: var(--interactive-normal);
        color: var(--text-normal);
        border: none;
        border-radius: var(--radius-s);
        padding: 4px 8px;
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        transition: background-color 0.1s ease;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.5; // 添加50%透明度
    }

    /* 图片上传按钮图标大小 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-upload-button svg {
        width: 16px;
        height: 16px;
    }

    /* 添加暗色模式特定样式 */
    .theme-dark .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-textarea {
        background-color: var(--background-primary);  /* 在暗色模式下使用主背景色 */
        opacity: 0.7;  /* 降低不透明度使其更暗 */
    }

    /* 按钮基础样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-header-button,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-send-button {
        background-color: rgba(var(--background-primary-rgb), 0.2);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(var(--background-primary-rgb), 0.1);
        color: var(--text-normal);
        border-radius: var(--radius-s);
        padding: 4px 8px;
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        transition: all 0.2s ease;
        opacity: 0.8;
    }

    /* 按钮悬停效果 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-header-button:hover,
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-send-button:hover {
        background-color: rgba(var(--background-primary-rgb), 0.3);
        opacity: 1;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    /* 下拉菜单样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .header-dropdowns select {
        background-color: rgba(var(--background-primary-rgb), 0.2);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        color: var(--text-normal);
        border: 1px solid rgba(var(--background-primary-rgb), 0.1);
        border-radius: var(--radius-s);
        padding: 4px 8px;
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        transition: all 0.2s ease;
        opacity: 0.8;
    }

    /* 下拉菜单悬停效果 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .header-dropdowns select:hover {
        background-color: rgba(var(--background-primary-rgb), 0.3);
        opacity: 1;
    }

    /* 下拉菜单选项样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .header-dropdowns select option {
        background-color: var(--background-primary);
        color: var(--text-normal);
        padding: 8px;
    }

    /* 图片上传按钮样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-upload-button {
        background-color: rgba(var(--background-primary-rgb), 0.2);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(var(--background-primary-rgb), 0.1);
        opacity: 0.8;
        transition: all 0.2s ease;
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-upload-button:hover {
        background-color: rgba(var(--background-primary-rgb), 0.3);
        opacity: 1;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] .chat-ai-image-preview {
        border: none !important;
        background: transparent !important;
    }

    /* 图片预览模态框样式 */
    .image-preview-modal-container {
        background: var(--background-primary);
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .image-preview-modal-img {
        transition: all 0.3s ease;
    }

    .image-preview-modal-close {
        opacity: 0.7;
        transition: opacity 0.2s ease;
    }

    .image-preview-modal-close:hover {
        opacity: 1;
    }

    /* 消息中的图片容器样式 */
    .message-image-wrapper {
        overflow: hidden;
        transition: transform 0.2s ease;
    }

    .message-image-wrapper:hover {
        transform: scale(1.02);
    }

    .message-image {
        transition: transform 0.2s ease;
    }

    .message-image:hover {
        transform: scale(1.05);
    }

    /* 设置弹窗中的样式调整 */
    .setting-item {
        border-top: none !important;
        padding: 12px 0 !important;
    }

    .setting-item .setting-item-control {
        flex-wrap: nowrap !important;
        gap: 8px !important;
        justify-content: flex-end !important;
        flex: 0.7 !important;
    }

    .setting-item .setting-item-info {
        flex: 1.3 !important;
    }

    /* 下拉菜单样式 */
    .setting-item select {
        width: 300px !important;
        background-color: var(--background-modifier-form-field);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
        padding: 4px 8px;
        border-radius: 4px;
        height: 32px !important;
    }

    /* 编辑列表按钮样式 */
    .setting-item button {
        white-space: nowrap;
        height: 32px !important;
        align-self: flex-start;
    }

    /* 确保描述文本不会过长 */
    .setting-item-description {
        padding-right: 16px;
    }

    /* 加载动画样式 */
    .chat-ai-loading-animation {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 30px; /* 根据需要调整加载动画的高度 */
    }
    .lds-ellipsis {
        display: inline-block;
        position: relative;
        width: 80px;
        height: 100%; /* 确保动画撑满父容器高度 */
    }
    .lds-ellipsis div {
        position: absolute;
        top: 50%;
        transform: translateY(-50%); /* 垂直居中 */
        width: 10px; /* 调整点的大小 */
        height: 10px; /* 调整点的大小 */
        border-radius: 50%;
        background: var(--text-muted);
        animation-timing-function: cubic-bezier(0, 1, 1, 0);
    }
    .lds-ellipsis div:nth-child(1) {
        left: 8px;
        animation: lds-ellipsis1 0.6s infinite;
    }
    .lds-ellipsis div:nth-child(2) {
        left: 8px;
        animation: lds-ellipsis2 0.6s infinite;
    }
    .lds-ellipsis div:nth-child(3) {
        left: 32px;
        animation: lds-ellipsis2 0.6s infinite;
    }
    .lds-ellipsis div:nth-child(4) {
        left: 56px;
        animation: lds-ellipsis3 0.6s infinite;
    }
    @keyframes lds-ellipsis1 {
        0% {
            transform: translateY(-50%) scale(0);
        }
        100% {
            transform: translateY(-50%) scale(1);
        }
    }
    @keyframes lds-ellipsis3 {
        0% {
            transform: translateY(-50%) scale(1);
        }
        100% {
            transform: translateY(-50%) scale(0);
        }
    }
    @keyframes lds-ellipsis2 {
        0% {
            transform: translateY(-50%) translateX(0);
        }
        100% {
            transform: translateY(-50%) translateX(24px);
        }
    }
    
    /* 配置按钮悬停效果 */
    .config-button {
        transition: background 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .config-button:hover {
        background: var(--background-primary-rgb) !important;
        box-shadow: 0 2px 8px 0 rgba(60,60,60,0.07);
        transform: translateY(-1px) scale(1.01);
    }
    
    /* 自定义配置项悬停效果 */
    .custom-config-item {
        transition: background 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                    box-shadow 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                    transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .custom-config-item:hover {
        background: var(--background-primary-rgb) !important;
        box-shadow: 0 2px 8px 0 rgba(60,60,60,0.07);
        transform: translateY(-1px) scale(1.01);
    }

    /* 滚动条样式 */
    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] ::-webkit-scrollbar {
        width: var(--scrollbar-width);
    }

    .workspace-leaf-content[data-type="${CHAT_VIEW_TYPE}"] ::-webkit-scrollbar-thumb {
        background-color: var(--scrollbar-thumb-bg);
        border: var(--scrollbar-thumb-border-width) solid transparent;
        border-radius: var(--scrollbar-thumb-radius);
        background-clip: padding-box;
    }
`;

// 将样式添加到文档头部
document.head.appendChild(style);

// 在样式开始处添加 CSS 变量
document.body.style.setProperty('--background-primary-rgb', '255, 255, 255'); // 亮色主题
// 或者根据当前主题动态设置

// 在样式开始处添加这个变量定义
document.body.style.setProperty('--background-secondary-alt-rgb', '240, 240, 240'); // 浅色主题
// 如果是深色主题可以使用不同的RGB值

// 在 DEFAULT_SETTINGS 后添加图片预览模态框类
class ImagePreviewModal extends Modal {
    constructor(app, imageUrl) {
        super(app);
        this.imageUrl = imageUrl;
    }

    onOpen() {
        const {contentEl} = this;
        
        // 创建图片容器
        const imageContainer = contentEl.createDiv({
            cls: 'image-preview-modal-container',
            attr: {
                style: `
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 200px;
                    max-height: 80vh;
                    position: relative;
                `
            }
        });

        // 创建图片元素
        const img = imageContainer.createEl('img', {
            cls: 'image-preview-modal-img',
            attr: {
                src: this.imageUrl,
                style: `
                    max-width: 100%;
                    max-height: 80vh;
                    object-fit: contain;
                    cursor: zoom-in;
                `
            }
        });

        // 添加缩放功能
        let isZoomed = false;
        img.addEventListener('click', () => {
            isZoomed = !isZoomed;
            if (isZoomed) {
                img.style.maxHeight = 'none';
                img.style.maxWidth = 'none';
                img.style.cursor = 'zoom-out';
            } else {
                img.style.maxHeight = '80vh';
                img.style.maxWidth = '100%';
                img.style.cursor = 'zoom-in';
            }
        });
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

// 添加新的 SystemMessageCreateModal 类
class SystemMessageCreateModal extends Modal {
    constructor(app, onSubmit) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 添加标题
        contentEl.createEl('h2', { text: '新建System Message' });

        // 创建文件名输入区域
        const titleContainer = contentEl.createDiv({
            cls: 'system-message-title-container',
            attr: {
                style: 'margin-bottom: 16px;'
            }
        });
        titleContainer.createEl('label', { 
            text: '文件名',
            attr: {
                style: 'display: block; margin-bottom: 8px; color: var(--text-muted);'
            }
        });
        this.titleInput = titleContainer.createEl('input', {
            type: 'text',
            cls: 'system-message-title-input',
            attr: {
                style: `
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 4px;
                    background-color: var(--background-primary);
                    color: var(--text-normal);
                `
            }
        });

        // 创建内容输入区域
        const contentContainer = contentEl.createDiv({
            cls: 'system-message-content-container',
            attr: {
                style: 'margin-bottom: 16px;'
            }
        });
        contentContainer.createEl('label', { 
            text: '内容',
            attr: {
                style: 'display: block; margin-bottom: 8px; color: var(--text-muted);'
            }
        });
        this.contentInput = contentContainer.createEl('textarea', {
            cls: 'system-message-content-input',
            attr: {
                rows: '10',
                style: `
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 4px;
                    background-color: var(--background-primary);
                    color: var(--text-normal);
                    resize: vertical;
                    min-height: 200px;
                    font-family: var(--font-monospace);
                `
            }
        });

        // 创建按钮容器
        const buttonContainer = contentEl.createDiv({
            cls: 'system-message-buttons',
            attr: {
                style: 'display: flex; justify-content: flex-end; gap: 8px;'
            }
        });

        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', { 
            text: '取消',
            attr: {
                style: `
                    padding: 8px 16px;
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 4px;
                    background-color: var(--background-primary);
                    color: var(--text-normal);
                    cursor: pointer;
                `
            }
        });
        cancelButton.addEventListener('click', () => this.close());

        // 保存按钮
        const submitButton = buttonContainer.createEl('button', {
            cls: 'mod-cta',
            text: '保存',
            attr: {
                style: `
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                `
            }
        });
        submitButton.addEventListener('click', () => {
            const fileName = this.titleInput.value.trim();
            const content = this.contentInput.value.trim();
            
            if (!fileName) {
                new Notice('请输入文件名');
                this.titleInput.focus();
                return;
            }
            
            // 验证文件名是否包含非法字符
            const invalidChars = /[<>:"/\\|?*]/;
            if (invalidChars.test(fileName)) {
                new Notice('文件名不能包含以下字符: < > : " / \\ | ? *');
                this.titleInput.focus();
                return;
            }
            
            if (!content) {
                new Notice('请输入文件内容');
                this.contentInput.focus();
                return;
            }
            
            this.onSubmit(fileName, content);
            this.close();
        });

        // 设置初始焦点
        this.titleInput.focus();
        
        // 添加键盘快捷键
        this.titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.contentInput.focus();
            }
        });
        
        this.contentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                submitButton.click();
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SystemMessageManageModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'System Message 文件管理' });
        
        // 创建顶部按钮容器
        const topButtonContainer = contentEl.createDiv({
            attr: {
                style: 'display: flex; justify-content: flex-start; margin-bottom: 16px;'
            }
        });
        
        // 添加创建按钮
        const createButton = topButtonContainer.createEl('button', {
            text: '创建系统提示词文件',
            cls: 'mod-cta',
            attr: {
                style: 'background: var(--interactive-accent); color: var(--text-on-accent);'
            }
        });
        createButton.addEventListener('click', () => {
            this.openCreateModal();
        });
        
        // 创建文件列表容器
        this.listContainer = contentEl.createDiv({
            attr: {
                style: 'max-height: 400px; overflow-y: auto; border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 8px;'
            }
        });
        
        this.loadFileList(this.listContainer);
        
        // 关闭按钮
        const buttonContainer = contentEl.createDiv({
            attr: {
                style: 'display: flex; justify-content: flex-end; margin-top: 20px;'
            }
        });
        
        const closeButton = buttonContainer.createEl('button', {
            text: '关闭',
            cls: 'mod-cta'
        });
        closeButton.addEventListener('click', () => {
            this.close();
        });
    }

    openCreateModal() {
        const createModal = new SystemMessageCreateModal(this.app, async (fileName, content) => {
            try {
                // 确保文件名以.md结尾
                const finalFileName = fileName.endsWith('.md') ? fileName : fileName + '.md';
                
                // 确保System Message目录存在
                let folder = this.app.vault.getAbstractFileByPath(this.plugin.settings.systemMessagePath);
                if (!(folder instanceof TFolder)) {
                    try {
                        folder = await this.app.vault.createFolder(this.plugin.settings.systemMessagePath);
                    } catch (error) {
                        console.error('创建System Message文件夹失败:', error);
                        new Notice('创建System Message文件夹失败，请检查路径是否合法');
                        return;
                    }
                }
                
                // 创建文件
                const filePath = `${this.plugin.settings.systemMessagePath}/${finalFileName}`;
                
                // 检查文件是否已存在
                const existingFile = this.app.vault.getAbstractFileByPath(filePath);
                if (existingFile) {
                    new Notice(`文件 "${finalFileName}" 已存在，请使用其他名称`);
                    return;
                }
                
                await this.app.vault.create(filePath, content);
                new Notice(`已创建文件: ${finalFileName}`);
                
                // 更新文件列表
                this.loadFileList(this.listContainer);
                
                // 更新所有ChatView的下拉菜单
                this.plugin.updateAllChatViews();
                
            } catch (error) {
                console.error('创建文件失败:', error);
                new Notice('创建文件失败');
            }
        });
        createModal.open();
    }

    async loadFileList(container) {
        container.empty();
        
        // 获取System Message目录下的所有文件
        const files = this.app.vault.getFiles()
            .filter(file => 
                file.path.startsWith(this.plugin.settings.systemMessagePath) && 
                file.extension === 'md'
            );
        
        if (files.length === 0) {
            container.createDiv({
                text: '暂无System Message文件',
                attr: {
                    style: 'text-align: center; color: var(--text-muted); padding: 20px;'
                }
            });
            return;
        }
        
        // 为每个文件创建一行
        files.forEach(file => {
            const fileItem = container.createDiv({
                attr: {
                    style: 'display: flex; align-items: center; justify-content: space-between; padding: 8px; border-bottom: 1px solid var(--background-modifier-border-hover);'
                }
            });
            
            // 文件名
            const fileName = fileItem.createSpan({
                text: file.basename,
                attr: {
                    style: 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
                }
            });
            
            // 按钮容器
            const buttonContainer = fileItem.createDiv({
                attr: {
                    style: 'display: flex; gap: 8px; margin-left: 8px;'
                }
            });
            
            // 编辑按钮
            const editButton = buttonContainer.createEl('button', {
                attr: {
                    style: 'padding: 4px 8px; border-radius: 4px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; cursor: pointer; font-size: 12px;',
                    title: '编辑文件'
                }
            });
            editButton.innerHTML = '✏️';
            editButton.addEventListener('click', async () => {
                // 打开文件
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);
                this.close();
            });
            
            // 删除按钮
            const deleteButton = buttonContainer.createEl('button', {
                attr: {
                    style: 'padding: 4px 8px; border-radius: 4px; background: var(--color-red); color: white; border: none; cursor: pointer; font-size: 12px;',
                    title: '删除文件'
                }
            });
            deleteButton.innerHTML = '❌';
            deleteButton.addEventListener('click', async () => {
                try {
                    await this.app.vault.delete(file);
                    new Notice(`已删除文件: ${file.basename}`);
                    
                    // 如果删除的是当前选中的文件，清空选择
                    if (this.plugin.settings.currentSystemMessageFile === file.name) {
                        this.plugin.settings.currentSystemMessageFile = '';
                        this.plugin.settings.currentSystemMessage = '';
                        await this.plugin.saveSettings();
                        
                        // 更新所有ChatView的下拉菜单
                        this.plugin.updateAllChatViews();
                    }
                    
                    // 重新加载文件列表
                    this.loadFileList(this.listContainer);
                } catch (error) {
                    console.error('删除文件失败:', error);
                    new Notice('删除文件失败');
                }
            });
            
            // 添加hover效果
            fileItem.addEventListener('mouseenter', () => {
                fileItem.style.background = 'var(--background-modifier-hover)';
            });
            fileItem.addEventListener('mouseleave', () => {
                fileItem.style.background = 'transparent';
            });
        });
    }



    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ParameterEditModal extends Modal {
    constructor(app, plugin, paramType, currentValue, onSubmit) {
        super(app);
        this.plugin = plugin;
        this.paramType = paramType; // 'vendor', 'key', 'model'
        this.currentValue = currentValue;
        this.onSubmit = onSubmit;
        
        // 根据参数类型获取所有选项列表
        let paramsList;
        switch (this.paramType) {
            case 'vendor':
                paramsList = this.plugin.settings.baseUrl;
                break;
            case 'key':
                paramsList = this.plugin.settings.apiKey;
                break;
            case 'model':
                paramsList = this.plugin.settings.model;
                break;
            default:
                paramsList = [];
        }
        
        // 将选项列表转换为文本
        this.paramListString = Array.isArray(paramsList) ? paramsList.join('\n') : '';
        // 解析参数和备注
        this.parsedParams = this.parseParams(paramsList);
    }

    // 解析参数字符串，分离备注和实际参数
    parseParams(paramsList) {
        if (!Array.isArray(paramsList)) return [];
        
        return paramsList.map(param => {
            let note = '';
            let value = param.trim();
            
            // 对于 vendor 和 key 类型，尝试分离备注和参数值
            if (this.paramType === 'vendor' || this.paramType === 'key') {
                // 对于 vendor 类型，尝试提取 URL
                if (this.paramType === 'vendor') {
                    // 匹配 URL 模式
                    const urlMatch = value.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        const url = urlMatch[1];
                        note = value.replace(url, '').trim();
                        value = url;
                    }
                }
                // 对于 key 类型，尝试拆分备注与密钥
                else if (this.paramType === 'key') {
                    const parsed = parseKeyEntry(value);
                    note = parsed.note;
                    if (parsed.key) {
                        value = parsed.key;
                    }
                }
            }
            
            return { note, value };
        });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('parameter-edit-modal');

        // 标题和描述
        let title, description;
        switch (this.paramType) {
            case 'vendor':
                title = '编辑供应商列表';
                description = '在左侧输入备注，右侧输入供应商URL';
                break;
            case 'key':
                title = '编辑API密钥列表';
                description = '在左侧输入备注，右侧输入API密钥';
                break;
            case 'model':
                title = '编辑模型列表';
                description = '每行输入一个模型名称';
                break;
            default:
                title = '编辑参数列表';
                description = '请在下方编辑参数';
        }

        // 添加标题和说明
        const headerEl = contentEl.createDiv({ cls: 'parameter-edit-modal-header' });
        headerEl.createEl('h2', { text: title, cls: 'parameter-edit-modal-title' });
        headerEl.createEl('p', { 
            text: description,
            cls: 'parameter-edit-modal-description'
        });
        
        // 创建主容器
        const mainContainer = contentEl.createDiv({
            cls: 'parameter-edit-modal-container'
        });
        
        // 添加自定义样式
        this.addStyles();
        
        // 如果是 model 类型，只显示单列
        if (this.paramType === 'model') {
            // 创建文本区域用于编辑所有参数
            this.textArea = mainContainer.createEl('textarea', {
                cls: 'parameter-edit-textarea',
                attr: {
                    rows: '15',
                    placeholder: '每行输入一个模型名称'
                }
            });
            
            // 设置文本区域内容为当前所有参数
            this.textArea.value = this.paramListString;
        } else {
            // 创建表格式布局，左侧备注，右侧参数
            const tableContainer = mainContainer.createDiv({
                cls: 'parameter-edit-table-container'
            });
            
            // 表头
            const headerRow = tableContainer.createDiv({
                cls: 'parameter-edit-table-row parameter-edit-table-header'
            });
            
            headerRow.createDiv({
                cls: 'parameter-edit-table-cell',
                text: '备注'
            });
            
            headerRow.createDiv({
                cls: 'parameter-edit-table-cell',
                text: this.paramType === 'vendor' ? 'URL' : 'API密钥'
            });
            
            // 添加一个空行
            this.addEmptyRow(tableContainer);
            
            // 添加已有的参数行
            this.parsedParams.forEach(param => {
                this.addParamRow(tableContainer, param.note, param.value);
            });
            
            // 参数行容器，用于动态添加/删除行
            this.rowsContainer = tableContainer;
            
            // 添加"添加行"按钮
            const addRowButton = mainContainer.createEl('button', {
                cls: 'parameter-edit-add-row-button',
                text: '+ 添加行'
            });
            
            addRowButton.addEventListener('click', () => {
                this.addEmptyRow(this.rowsContainer);
                // 滚动到底部
                this.rowsContainer.scrollTop = this.rowsContainer.scrollHeight;
            });
        }

        // 按钮容器
        const buttonContainer = contentEl.createDiv({
            cls: 'parameter-edit-modal-buttons'
        });

        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', { 
            text: '取消',
            cls: 'parameter-edit-button'
        });
        cancelButton.addEventListener('click', () => this.close());

        // 保存按钮
        const saveButton = buttonContainer.createEl('button', {
            cls: 'parameter-edit-button parameter-edit-save-button',
            text: '保存'
        });
        saveButton.addEventListener('click', () => this.saveChanges());
        
        // 添加 Ctrl+Enter 快捷键监听
        contentEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault(); // 阻止默认的回车行为
                this.saveChanges();
            }
        });
    }
    
    // 添加空白参数行
    addEmptyRow(container, note = '', value = '') {
        this.addParamRow(container, note, value);
    }
    
    // 添加参数行
    addParamRow(container, note, value) {
        const rowEl = container.createDiv({
            cls: 'parameter-edit-table-row'
        });
        
        // 备注输入框
        const noteCell = rowEl.createDiv({
            cls: 'parameter-edit-table-cell'
        });
        
        const noteInput = noteCell.createEl('input', {
            cls: 'parameter-edit-input parameter-edit-note',
            attr: {
                type: 'text',
                value: note,
                placeholder: '备注（可选）'
            }
        });
        
        // 参数值输入框
        const valueCell = rowEl.createDiv({
            cls: 'parameter-edit-table-cell'
        });
        
        const valueInput = valueCell.createEl('input', {
            cls: 'parameter-edit-input parameter-edit-value',
            attr: {
                type: 'text',
                value: value,
                placeholder: this.paramType === 'vendor' ? '输入URL' : '输入API密钥'
            }
        });
        
        // 删除按钮
        const deleteCell = rowEl.createDiv({
            cls: 'parameter-edit-table-cell parameter-edit-delete-cell'
        });
        
        const deleteButton = deleteCell.createEl('button', {
            cls: 'parameter-edit-delete-button',
            text: '×'
        });
        
        deleteButton.addEventListener('click', () => {
            rowEl.remove();
        });
        
        return rowEl;
    }
    
    // 添加样式
    addStyles() {
        // 避免重复添加样式
        const existingStyle = document.getElementById('parameter-edit-modal-styles');
        if (existingStyle) return;
        
        const styleEl = document.createElement('style');
        styleEl.id = 'parameter-edit-modal-styles';
        styleEl.textContent = `
            .parameter-edit-modal {
                width: 100%;
                max-width: 1000px; /* 进一步增加最大宽度，原为800px */
            }
            
            .parameter-edit-modal-header {
                margin-bottom: 16px;
            }
            
            .parameter-edit-modal-title {
                margin: 0 0 8px 0;
                font-size: 1.5em;
            }
            
            .parameter-edit-modal-description {
                margin: 0;
                color: var(--text-muted);
            }
            
            .parameter-edit-modal-container {
                margin-bottom: 16px;
            }
            
            .parameter-edit-textarea {
                width: 100%;
                height: 500px; /* 进一步增加文本区域高度 */
                min-height: 400px; /* 增加最小高度 */
                font-family: monospace;
                resize: vertical;
                background-color: var(--background-modifier-form-field);
                padding: 10px; /* 增加内边距 */
                border-radius: 4px;
                border: 1px solid var(--background-modifier-border);
                font-size: 15px; /* 增加字体大小 */
            }
            
            .parameter-edit-table-container {
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                max-height: 700px; /* 进一步增加表格容器高度 */
                overflow-y: auto;
                margin-bottom: 12px;
                background-color: var(--background-secondary);
            }
            
            .parameter-edit-table-row {
                display: flex;
                border-bottom: 1px solid var(--background-modifier-border);
                align-items: center;
            }
            
            .parameter-edit-table-row:last-child {
                border-bottom: none;
            }
            
            .parameter-edit-table-header {
                font-weight: bold;
                background-color: var(--interactive-accent-hover);
                color: var(--text-on-accent);
                position: sticky;
                top: 0;
                z-index: 1;
                opacity: 1;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            }
            
            .parameter-edit-table-cell {
                padding: 10px 12px; /* 增加单元格内边距 */
                flex: 1;
            }
            
            .parameter-edit-table-header .parameter-edit-table-cell {
                padding: 10px 8px;
                font-weight: 600;
            }
            
            .parameter-edit-delete-cell {
                flex: 0 0 40px;
                text-align: center;
            }
            
            .parameter-edit-input {
                width: 100%;
                background-color: var(--background-modifier-form-field);
                border: 1px solid var(--background-modifier-border);
                border-radius: 4px;
                padding: 10px; /* 进一步增加输入框内边距 */
                font-size: 15px; /* 增加字体大小 */
                height: 36px; /* 增加高度 */
            }
            
            .parameter-edit-delete-button {
                background-color: var(--background-modifier-error-hover);
                color: var(--text-on-accent);
                border: none;
                border-radius: 50%;
                width: 30px; /* 增加按钮大小 */
                height: 30px; /* 增加按钮大小 */
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px; /* 增加字体大小 */
                cursor: pointer;
                padding: 0;
                line-height: 1;
            }
            
            .parameter-edit-add-row-button {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                border-radius: 6px;
                padding: 12px 16px; /* 进一步增加按钮内边距 */
                cursor: pointer;
                width: 100%;
                margin-top: 12px;
                font-size: 16px; /* 进一步增加字体大小 */
                font-weight: 600; /* 增加字体粗细 */
            }
            
            .parameter-edit-modal-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            
            .parameter-edit-button {
                padding: 8px 16px; /* 增加按钮内边距，原为6px 12px */
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px; /* 增加字体大小 */
            }
            
            .parameter-edit-save-button {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
            }
        `;
        document.head.appendChild(styleEl);
    }
    
    // 保存更改方法
    async saveChanges() {
        console.group('ParameterEditModal saveChanges');
        console.log('保存前状态:');
        console.log('参数类型:', this.paramType);
        console.log('当前API Key:', this.plugin.settings.currentApiKey);
        console.log('当前BaseUrl:', this.plugin.settings.currentBaseUrl);
        console.log('当前Model:', this.plugin.settings.currentModel);
        console.log('当前所有自定义配置:', this.plugin.settings.customConfigs);
        
        let paramsArray = [];
        
        // 如果是 model 类型，直接从文本区域获取
        if (this.paramType === 'model') {
            paramsArray = this.textArea.value.split('\n').filter(line => line.trim());
            console.log('从文本框中解析的参数列表:', paramsArray);
        } else {
            // 从表格中获取参数
            const rows = this.rowsContainer.querySelectorAll('.parameter-edit-table-row:not(.parameter-edit-table-header)');
            console.log('表格行数:', rows.length);
            
            rows.forEach((row, index) => {
                const noteInput = row.querySelector('.parameter-edit-note');
                const valueInput = row.querySelector('.parameter-edit-value');
                
                if (!noteInput || !valueInput) {
                    console.log(`行 ${index+1}: 找不到输入框`);
                    return;
                }
                
                const note = noteInput.value.trim();
                const value = valueInput.value.trim();
                console.log(`行 ${index+1}: 备注="${note}", 值="${value}"`);
                
                // 只有当值不为空时才添加
                if (value) {
                    // 如果有备注，则组合备注和值
                    const param = note ? `${note} ${value}` : value;
                    paramsArray.push(param);
                    console.log(`行 ${index+1}: 添加参数 "${param}"`);
                } else {
                    console.log(`行 ${index+1}: 值为空，忽略此行`);
                }
            });
        }
        
        console.log('解析后的参数数组:', paramsArray);
        
        // 根据参数类型进行相应保存
        switch (this.paramType) {
            case 'vendor':
                console.log('处理 vendor 类型参数:');
                this.plugin.settings.baseUrl = paramsArray;
                console.log('设置 baseUrl 数组为:', paramsArray);
                
                // 检查当前选中的URL是否在新列表中的任何项中
                let foundBaseUrl = false;
                console.log('检查当前BaseUrl是否在新列表中, 当前值:', this.plugin.settings.currentBaseUrl);
                
                for (const param of paramsArray) {
                    console.log(`检查参数项: "${param}"`);
                    const urlMatch = param.match(/(https?:\/\/\S+)/);
                    const urlInParam = urlMatch ? urlMatch[1] : param;
                    
                    if (param.includes(this.plugin.settings.currentBaseUrl) || 
                        this.plugin.settings.currentBaseUrl.includes(urlInParam)) {
                        foundBaseUrl = true;
                        console.log(`找到匹配项: "${param}"`);
                        break;
                    }
                }
                
                // 如果找不到匹配项，则设为第一项
                if (!foundBaseUrl) {
                    console.log('未找到匹配的BaseUrl，设置为第一项');
                    this.plugin.settings.currentBaseUrl = paramsArray.length > 0 ? paramsArray[0] : '';
                    console.log('新的currentBaseUrl:', this.plugin.settings.currentBaseUrl);
                } else {
                    console.log('保持当前BaseUrl不变:', this.plugin.settings.currentBaseUrl);
                }
                break;
                
            case 'key':
                console.log('处理 key 类型参数:');
                this.plugin.settings.apiKey = paramsArray;
                console.log('设置 apiKey 数组为:', paramsArray);
                
                // 提取当前API密钥的实际值
                const currentKeyValue = getKeyValueFromEntry(this.plugin.settings.currentApiKey);
                console.log('当前API Key值:', this.plugin.settings.currentApiKey);
                console.log('提取的API Key部分:', currentKeyValue);
                
                // 检查新列表中是否有包含当前密钥值的项
                let foundKey = false;
                console.log('开始检查参数列表:');
                
                for (const param of paramsArray) {
                    console.log(`检查参数项: "${param}"`);
                    const paramKeyValue = getKeyValueFromEntry(param);
                    const keyMatches = paramKeyValue && currentKeyValue
                        ? paramKeyValue === currentKeyValue
                        : (currentKeyValue ? param.includes(currentKeyValue) : false);
                    
                    if (keyMatches) {
                        foundKey = true;
                        // 可选：更新为完整格式（包含备注）
                        console.log(`找到匹配项: "${param}"`);
                        console.log(`将currentApiKey从"${this.plugin.settings.currentApiKey}"更新为"${param}"`);
                        this.plugin.settings.currentApiKey = param;
                        break;
                    }
                }
                
                // 如果找不到匹配项，则设为第一项
                if (!foundKey && paramsArray.length > 0) {
                    console.log('未找到匹配的API Key，设置为第一项');
                    this.plugin.settings.currentApiKey = paramsArray[0];
                    console.log('新的currentApiKey:', this.plugin.settings.currentApiKey);
                } else if (paramsArray.length === 0) {
                    console.log('参数列表为空，清空currentApiKey');
                    this.plugin.settings.currentApiKey = '';
                } else {
                    console.log('保持或已更新currentApiKey为:', this.plugin.settings.currentApiKey);
                }
                
                break;
                
            case 'model':
                console.log('处理 model 类型参数:');
                this.plugin.settings.model = paramsArray;
                console.log('设置 model 数组为:', paramsArray);
                
                console.log('检查当前Model是否在新列表中, 当前值:', this.plugin.settings.currentModel);
                if (!paramsArray.includes(this.plugin.settings.currentModel)) {
                    console.log('未找到匹配的Model，设置为第一项');
                    this.plugin.settings.currentModel = paramsArray.length > 0 ? paramsArray[0] : '';
                    console.log('新的currentModel:', this.plugin.settings.currentModel);
                } else {
                    console.log('保持当前Model不变:', this.plugin.settings.currentModel);
                }
                break;
        }
        
        console.log('保存后状态:');
        console.log('当前API Key:', this.plugin.settings.currentApiKey);
        console.log('当前BaseUrl:', this.plugin.settings.currentBaseUrl);
        console.log('当前Model:', this.plugin.settings.currentModel);

        // 检查并更新自定义配置
        let configsUpdated = false;
        if (Array.isArray(this.plugin.settings.customConfigs) && this.plugin.settings.customConfigs.length > 0) {
            console.log('检查并更新自定义配置');
            for (let i = 0; i < this.plugin.settings.customConfigs.length; i++) {
                const config = this.plugin.settings.customConfigs[i];
                console.log(`检查配置: ${config.name}`);
                
                // 处理key类型的参数变更
                if (this.paramType === 'key') {
                    const configKeyValue = getKeyValueFromEntry(config.apiKey);
                    console.log(`配置的API Key: ${config.apiKey}, 提取值: ${configKeyValue}`);
                    
                    // 如果配置中的API Key不再存在于更新后的列表中
                    let foundInNewList = false;
                    let matchedParam = null;
                    for (const param of paramsArray) {
                        const paramKeyValue = getKeyValueFromEntry(param);
                        const keyMatches = paramKeyValue && configKeyValue
                            ? paramKeyValue === configKeyValue
                            : (configKeyValue ? param.includes(configKeyValue) : false);
                        if (keyMatches) {
                            foundInNewList = true;
                            matchedParam = param;
                            break;
                        }
                    }
                    
                    if (!foundInNewList) {
                        console.log(`配置"${config.name}"的API Key(${config.apiKey})不在新列表中，更新为第一个可用的Key`);
                        if (paramsArray.length > 0) {
                            // 更新为第一个可用的Key
                            this.plugin.settings.customConfigs[i].apiKey = paramsArray[0];
                            console.log(`已更新配置"${config.name}"的API Key为: ${paramsArray[0]}`);
                            configsUpdated = true;
                        }
                    } else if (matchedParam && matchedParam !== config.apiKey) {
                        // 如果找到了匹配项，但格式不同，更新为标准格式
                        console.log(`配置"${config.name}"的API Key格式更新: ${config.apiKey} -> ${matchedParam}`);
                        this.plugin.settings.customConfigs[i].apiKey = matchedParam;
                        configsUpdated = true;
                    } else {
                        console.log(`配置"${config.name}"的API Key在新列表中，不需要更新`);
                    }
                }
                
                // 处理vendor类型的参数变更
                else if (this.paramType === 'vendor') {
                    const configBaseUrl = config.baseUrl;
                    console.log(`配置的Base URL: ${configBaseUrl}`);
                    
                    // 检查是否还存在于列表中
                    let foundInNewList = false;
                    let matchedParam = null;
                    for (const param of paramsArray) {
                        // 提取URL部分
                        const urlMatch = param.match(/(https?:\/\/\S+)/);
                        const urlInParam = urlMatch ? urlMatch[1] : param;
                        
                        if (configBaseUrl.includes(urlInParam) || urlInParam.includes(configBaseUrl)) {
                            foundInNewList = true;
                            matchedParam = param;
                            break;
                        }
                    }
                    
                    if (!foundInNewList && paramsArray.length > 0) {
                        console.log(`配置"${config.name}"的Base URL不在新列表中，更新为第一个URL`);
                        this.plugin.settings.customConfigs[i].baseUrl = paramsArray[0];
                        console.log(`已更新配置"${config.name}"的Base URL为: ${paramsArray[0]}`);
                        configsUpdated = true;
                    } else if (matchedParam && matchedParam !== configBaseUrl) {
                        console.log(`配置"${config.name}"的Base URL格式更新: ${configBaseUrl} -> ${matchedParam}`);
                        this.plugin.settings.customConfigs[i].baseUrl = matchedParam;
                        configsUpdated = true;
                    }
                }
                
                // 处理model类型的参数变更
                else if (this.paramType === 'model') {
                    const configModel = config.model;
                    console.log(`配置的模型: ${configModel}`);
                    
                    if (!paramsArray.includes(configModel) && paramsArray.length > 0) {
                        console.log(`配置"${config.name}"的模型不在新列表中，更新为第一个模型`);
                        this.plugin.settings.customConfigs[i].model = paramsArray[0];
                        console.log(`已更新配置"${config.name}"的模型为: ${paramsArray[0]}`);
                        configsUpdated = true;
                    }
                }
            }
            
            // 如果有配置被更新，保存设置
            if (configsUpdated) {
                console.log('自定义配置已更新，保存设置');
                await this.plugin.saveSettings();
            }
        }
        
        // 调用onSubmit回调前记录
        console.log('调用onSubmit回调...');
        
        // 调用onSubmit回调
        if (this.onSubmit) {
            await this.onSubmit(paramsArray);
            console.log('onSubmit回调已完成');
        }
        
        // 关闭弹窗
        console.log('关闭弹窗');
        console.groupEnd();
        this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ImportModeModal extends Modal {
    constructor(app, onChoose) {
        super(app);
        this.onChoose = onChoose;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '选择导入模式' });

        const description = contentEl.createEl('p', { 
            text: '请选择导入模式：',
            attr: {
                style: 'margin-bottom: 20px;'
            }
        });

        // 创建按钮容器
        const buttonContainer = contentEl.createDiv({
            attr: {
                style: 'display: flex; justify-content: space-around; gap: 20px;'
            }
        });

        // 覆盖按钮
        const overrideButton = buttonContainer.createEl('button', {
            text: '覆盖',
            attr: {
                style: `
                    padding: 10px 20px;
                    border-radius: 4px;
                    background-color: var(--background-modifier-error);
                    color: var(--text-on-accent);
                    cursor: pointer;
                    border: none;
                `
            }
        });
        overrideButton.addEventListener('click', () => {
            this.onChoose('override');
            this.close();
        });

        // 追加按钮
        const appendButton = buttonContainer.createEl('button', {
            text: '追加',
            cls: 'mod-cta',
            attr: {
                style: `
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                `
            }
        });
        appendButton.addEventListener('click', () => {
            this.onChoose('append');
            this.close();
        });

        // 添加说明文本
        const overrideDesc = contentEl.createEl('p', {
            text: '覆盖：清空当前所有设置并导入新设置，覆盖同名System Message文件',
            attr: {
                style: 'color: var(--text-muted); font-size: 0.8em; margin-top: 20px;'
            }
        });

        const appendDesc = contentEl.createEl('p', {
            text: '追加：保留当前设置，只添加新的设置项和新的System Message文件',
            attr: {
                style: 'color: var(--text-muted); font-size: 0.8em; margin-top: 5px;'
            }
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 添加配置编辑模态框
class ConfigEditModal extends Modal {
    constructor(app, plugin, config = null) {
        super(app);
        this.plugin = plugin;
        this.config = config || {
            name: '',
            apiKey: this.plugin.settings.currentApiKey,
            baseUrl: this.plugin.settings.currentBaseUrl,
            model: this.plugin.settings.currentModel,
            useProxy: this.plugin.settings.useProxy,
            proxyUrl: this.plugin.settings.proxyUrl,
            currentSystemMessageFile: this.plugin.settings.currentSystemMessageFile || '',
            currentSystemMessage: this.plugin.settings.currentSystemMessage || '',
            useStreaming: this.plugin.settings.useStreaming || true // 添加流式模式设置
        };
        this.isNewConfig = !config;
        this.systemMessageContent = ''; // 用于存储选择的system message内容
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        console.log('[ConfigEditModal] onOpen - Initial config:', JSON.stringify(this.config)); // ADDED
        
        contentEl.createEl('h2', { text: this.isNewConfig ? '添加自定义配置' : '编辑自定义配置' });
        
        // 配置名称
        const nameContainer = contentEl.createDiv({ cls: 'setting-item' });
        nameContainer.createEl('label', { text: '配置名称：' });
        this.nameInput = nameContainer.createEl('input', {
            type: 'text',
            value: this.config.name,
            attr: {
                placeholder: '输入配置名称',
                style: 'width: 100%; margin-top: 8px;'
            }
        });
        
        // API密钥下拉菜单
        const apiKeyContainer = contentEl.createDiv({ 
            cls: 'setting-item',
            attr: { style: 'margin-top: 16px;' } 
        });
        apiKeyContainer.createEl('label', { text: 'API密钥：' });
        this.apiKeySelect = apiKeyContainer.createEl('select', {
            attr: { style: 'width: 100%; margin-top: 8px;' }
        });
        
        // 确保apiKey是数组
        if (!Array.isArray(this.plugin.settings.apiKey)) {
            this.plugin.settings.apiKey = this.plugin.settings.apiKey.split('\n').filter(line => line.trim());
        }
        
        this.plugin.settings.apiKey.forEach(key => {
            const option = this.apiKeySelect.createEl('option', {
                text: key,
                value: key
            });
            if (key === this.config.apiKey) {
                option.selected = true;
            }
        });
        
        // Base URL下拉菜单
        const baseUrlContainer = contentEl.createDiv({ 
            cls: 'setting-item',
            attr: { style: 'margin-top: 16px;' } 
        });
        baseUrlContainer.createEl('label', { text: 'Base URL：' });
        this.baseUrlSelect = baseUrlContainer.createEl('select', {
            attr: { style: 'width: 100%; margin-top: 8px;' }
        });
        
        // 确保baseUrl是数组
        if (!Array.isArray(this.plugin.settings.baseUrl)) {
            this.plugin.settings.baseUrl = [this.plugin.settings.baseUrl];
        }
        
        this.plugin.settings.baseUrl.forEach(url => {
            const option = this.baseUrlSelect.createEl('option', {
                text: url,
                value: url
            });
            if (url === this.config.baseUrl) {
                option.selected = true;
            }
        });
        
        // 模型下拉菜单
        const modelContainer = contentEl.createDiv({ 
            cls: 'setting-item',
            attr: { style: 'margin-top: 16px;' } 
        });
        modelContainer.createEl('label', { text: '模型：' });
        this.modelSelect = modelContainer.createEl('select', {
            attr: { style: 'width: 100%; margin-top: 8px;' }
        });
        
        // 确保model是数组
        if (!Array.isArray(this.plugin.settings.model)) {
            this.plugin.settings.model = [this.plugin.settings.model];
        }
        
        this.plugin.settings.model.forEach(model => {
            const option = this.modelSelect.createEl('option', {
                text: model,
                value: model
            });
            if (model === this.config.model) {
                option.selected = true;
            }
        });
        
        // System Message下拉菜单
        const systemMessageContainer = contentEl.createDiv({ 
            cls: 'setting-item',
            attr: { style: 'margin-top: 16px;' } 
        });
        systemMessageContainer.createEl('label', { text: 'System Message：' });
        
        this.systemMessageSelect = systemMessageContainer.createEl('select', {
            attr: { style: 'width: 100%; margin-top: 8px;' }
        });
        
        // 添加空选项
        const emptyOption = this.systemMessageSelect.createEl('option', {
            text: '选择System Message',
            value: ''
        });
        
        if (!this.config.currentSystemMessageFile) {
            emptyOption.selected = true;
        }
        
        // 异步加载System Message文件 - This will now ONLY populate and set initial content
        this.loadSystemMessageFiles(); 
        
        // 移除旧的事件监听器，这些可能不是我们添加的，或者是为了清除默认行为
        // this.systemMessageSelect.removeEventListener('mousedown', this._systemMessageSelectMousedownHandler); 
        // this.systemMessageSelect.removeEventListener('focus', this._systemMessageSelectFocusHandler);
        
        // COMMENTED OUT problematic click listener
        /*
        // 添加点击事件，在下拉菜单打开前重新加载系统消息文件列表
        this.systemMessageSelect.addEventListener('click', async () => {
            // 清空现有选项并添加空选项
            this.systemMessageSelect.empty();
            const emptyOption = this.systemMessageSelect.createEl('option', {
                text: '选择System Message',
                value: ''
            });
            
            if (!this.config.currentSystemMessageFile) {
                emptyOption.selected = true;
            }
            
            // 重新加载系统消息文件列表
            await this.loadSystemMessageFiles();
        });
        */
        
        // COMMENTED OUT problematic focus listener
        /*
        // 添加聚焦事件
        this.systemMessageSelect.addEventListener('focus', async () => {
            // 清空现有选项并添加空选项
            this.systemMessageSelect.empty();
            const emptyOption = this.systemMessageSelect.createEl('option', {
                text: '选择System Message',
                value: ''
            });
            
            if (!this.config.currentSystemMessageFile) {
                emptyOption.selected = true;
            }
            
            // 重新加载系统消息文件列表
            await this.loadSystemMessageFiles();
        });
        */

        // ADDED 'change' listener here, ensuring it's added only once.
        this.systemMessageSelect.addEventListener('change', async () => {
            const selectedFile = this.systemMessageSelect.value;
            console.log('[ConfigEditModal] systemMessageSelect change - Selected file:', selectedFile);
            if (selectedFile) {
                const filePath = `${this.plugin.settings.systemMessagePath}/${selectedFile}`;
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    const content = await this.plugin.app.vault.read(file);
                    this.systemMessageContent = content;
                    console.log('[ConfigEditModal] systemMessageSelect change - Loaded content:', content ? content.substring(0, 100) + "..." : "null");
                } else {
                    console.warn('[ConfigEditModal] systemMessageSelect change - File not found or not a TFile:', filePath);
                    this.systemMessageContent = ''; 
                }
            } else {
                this.systemMessageContent = '';
                console.log('[ConfigEditModal] systemMessageSelect change - No file selected, content cleared.');
            }
        });
        
        // 代理开关
        const proxyContainer = contentEl.createDiv({ 
            cls: 'setting-item',
            attr: { style: 'margin-top: 16px; display: flex; align-items: center;' } 
        });
        proxyContainer.createEl('label', { text: '使用代理：' });
        this.proxyToggle = proxyContainer.createEl('input', {
            type: 'checkbox',
            attr: { style: 'margin-left: 8px;' }
        });
        this.proxyToggle.checked = this.config.useProxy;
        
        // 代理URL输入框
        const proxyUrlContainer = contentEl.createDiv({ 
            cls: 'setting-item',
            attr: { 
                style: 'margin-top: 16px; display: ' + (this.config.useProxy ? 'block' : 'none')
            } 
        });
        this.proxyUrlContainer = proxyUrlContainer;
        proxyUrlContainer.createEl('label', { text: '代理URL：' });
        this.proxyUrlInput = proxyUrlContainer.createEl('input', {
            type: 'text',
            value: this.config.proxyUrl,
            attr: {
                placeholder: '输入代理URL',
                style: 'width: 100%; margin-top: 8px;'
            }
        });
        
        // 当代理开关状态改变时，显示/隐藏代理URL输入框
        this.proxyToggle.addEventListener('change', () => {
            this.proxyUrlContainer.style.display = this.proxyToggle.checked ? 'block' : 'none';
        });
        
        // 流式模式开关
        const streamingContainer = contentEl.createDiv({ 
            cls: 'setting-item',
            attr: { style: 'margin-top: 16px; display: flex; align-items: center;' } 
        });
        streamingContainer.createEl('label', { text: '使用流式模式：' });
        this.streamingToggle = streamingContainer.createEl('input', {
            type: 'checkbox',
            attr: { style: 'margin-left: 8px;' }
        });
        this.streamingToggle.checked = this.config.useStreaming;
        
        // 按钮
        const buttonContainer = contentEl.createDiv({
            cls: 'setting-item-control',
            attr: {
                style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px;'
            }
        });
        
        // 取消按钮
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.addEventListener('click', () => {
            this.close();
        });
        
        // 保存按钮
        const saveButton = buttonContainer.createEl('button', {
            text: '保存',
            cls: 'mod-cta'
        });
        saveButton.addEventListener('click', () => {
            this.saveConfig();
        });
    }
    
    // 添加加载System Message文件的方法
    async loadSystemMessageFiles() {
        console.log('[ConfigEditModal] loadSystemMessageFiles - Start. Current config file from this.config:', this.config.currentSystemMessageFile); // ADDED
        // 确保系统消息路径存在
        const systemMessagePath = this.plugin.settings.systemMessagePath;
        if (!systemMessagePath) {
            console.log('[ConfigEditModal] loadSystemMessageFiles - No systemMessagePath defined in plugin settings.'); // ADDED
            return;
        }
        console.log('[ConfigEditModal] loadSystemMessageFiles - Path:', systemMessagePath); // ADDED
        
        // 获取系统消息文件夹
        const folder = this.plugin.app.vault.getAbstractFileByPath(systemMessagePath);
        if (!(folder instanceof TFolder)) {
            console.log('[ConfigEditModal] loadSystemMessageFiles - systemMessagePath is not a folder or does not exist:', systemMessagePath); // ADDED
            return;
        }
        
        // 获取并处理所有文件
        const systemMessageFiles = folder.children
            .filter(file => file instanceof TFile && file.extension === 'md')
            .sort((a, b) => a.name.localeCompare(b.name));
            
        console.log('[ConfigEditModal] loadSystemMessageFiles - Found files:', systemMessageFiles.map(f => f.name)); // ADDED

        // 清空现有选项（除了手动添加的"选择System Message"空选项）
        // 保留第一个空选项，移除其他由之前loadSystemMessageFiles可能添加的选项
        while (this.systemMessageSelect.options.length > 1) {
            this.systemMessageSelect.remove(1);
        }
            
        // 添加文件到下拉菜单
        for (const file of systemMessageFiles) {
            // console.log('[ConfigEditModal] loadSystemMessageFiles - Adding option:', file.name, 'Is selected based on config:', this.config.currentSystemMessageFile === file.name); // Slightly verbose, alternative below
            const option = this.systemMessageSelect.createEl('option', {
                text: file.name,
                value: file.name
            });
            
            // 如果配置中有系统消息文件，设置为选中
            if (this.config.currentSystemMessageFile === file.name) {
                option.selected = true; // This makes it selected in the dropdown
                console.log('[ConfigEditModal] loadSystemMessageFiles - Matched and selected option in dropdown:', file.name); // ADDED
                
                // 异步加载文件内容并设置为当前模态框的 systemMessageContent
                // This ensures that if the user doesn't change the selection, the initial content is loaded
                const content = await this.plugin.app.vault.read(file);
                this.systemMessageContent = content; 
                console.log('[ConfigEditModal] loadSystemMessageFiles - Initial content set for matched file', file.name, ':', content ? content.substring(0, 100) + "..." : "null"); // ADDED
            }
        }
        
        // REMOVED 'change' event listener from here. It's now in onOpen.
        /*
        // 添加change事件监听器
        this.systemMessageSelect.addEventListener('change', async () => {
            const selectedFile = this.systemMessageSelect.value;
            if (selectedFile) {
                const filePath = `${this.plugin.settings.systemMessagePath}/${selectedFile}`;
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    const content = await this.plugin.app.vault.read(file);
                    this.systemMessageContent = content;
                }
            } else {
                this.systemMessageContent = '';
            }
        });
        */
    } // End of loadSystemMessageFiles
    
    saveConfig() {
        const name = this.nameInput.value.trim();
        if (!name) {
            new Notice('请输入配置名称');
            return;
        }
        
        // 获取选择的system message文件和内容
        const selectedSystemMessageFile = this.systemMessageSelect.value;
        // this.systemMessageContent should have been updated by the 'change' event listener or initial load
        console.log('[ConfigEditModal] saveConfig - Saving. Name:', name, 'Selected File in dropdown:', selectedSystemMessageFile, 'Content to save (this.systemMessageContent):', this.systemMessageContent ? this.systemMessageContent.substring(0, 100) + "..." : "null"); // ADDED
        
        // 准备配置对象
        const updatedConfig = {
            name: name,
            apiKey: this.apiKeySelect.value,
            baseUrl: this.baseUrlSelect.value,
            model: this.modelSelect.value,
            useProxy: this.proxyToggle.checked,
            proxyUrl: this.proxyUrlInput.value,
            currentSystemMessageFile: selectedSystemMessageFile,
            currentSystemMessage: this.systemMessageContent,
            useStreaming: this.streamingToggle.checked // 添加流式模式设置
        };
        
        // 确保customConfigs是数组
        if (!Array.isArray(this.plugin.settings.customConfigs)) {
            this.plugin.settings.customConfigs = [];
        }
        
        // 检查名称是否已存在
        const existingIndex = this.plugin.settings.customConfigs.findIndex(c => c.name === name);
        
        if (existingIndex !== -1 && (this.isNewConfig || name !== this.config.name)) {
            new Notice(`配置名称 "${name}" 已存在，请使用其他名称`);
            return;
        }
        
        if (this.isNewConfig) {
            // 添加新配置
            this.plugin.settings.customConfigs.push(updatedConfig);
            new Notice(`配置 "${name}" 已创建`);
        } else {
            // 更新现有配置
            const index = this.plugin.settings.customConfigs.findIndex(c => c.name === this.config.name);
            if (index !== -1) {
                this.plugin.settings.customConfigs[index] = updatedConfig;
                
                // 如果当前配置正在使用，也更新当前设置
                if (this.plugin.settings.currentCustomConfig === this.config.name) {
                    this.plugin.settings.currentCustomConfig = updatedConfig.name;
                    this.plugin.settings.currentApiKey = updatedConfig.apiKey;
                    this.plugin.settings.currentBaseUrl = updatedConfig.baseUrl;
                    this.plugin.settings.currentModel = updatedConfig.model;
                    this.plugin.settings.useProxy = updatedConfig.useProxy;
                    this.plugin.settings.proxyUrl = updatedConfig.proxyUrl;
                    this.plugin.settings.currentSystemMessageFile = updatedConfig.currentSystemMessageFile;
                    this.plugin.settings.currentSystemMessage = updatedConfig.currentSystemMessage;
                    this.plugin.settings.useStreaming = updatedConfig.useStreaming; // 添加流式模式设置
                }
                
                new Notice(`配置 "${name}" 已更新`);
            }
        }
        
        // 保存设置并关闭
        this.plugin.saveSettings();
        
        // 更新所有打开的ChatView视图
        this.plugin.updateAllChatViews();
        
        this.close();
        
        // 如果设置模态框是打开的，不再使用onOpen()刷新，而是直接创建配置项
        if (this.plugin.setting && this.plugin.setting.containerEl) {
            const settingTab = this.plugin.setting;
            const containerEl = settingTab.containerEl;
            
            // 找到配置列表容器
            const configSectionContainer = containerEl.querySelector('.custom-configs-section');
            if (configSectionContainer) {
                // 查找或创建配置列表容器
                let configListContainer = configSectionContainer.querySelector('.custom-configs-list');
                
                // 如果是第一个配置，需要移除提示文本并创建列表容器
                if (!configListContainer) {
                    // 移除"尚未创建自定义配置"的提示文本
                    const emptyText = configSectionContainer.querySelector('p');
                    if (emptyText) emptyText.remove();
                    
                    // 创建配置列表容器
                    configListContainer = configSectionContainer.createDiv({
                        cls: 'custom-configs-list'
                    });
                }
                
                // 如果是更新现有配置，先移除旧的配置项
                if (!this.isNewConfig) {
                    const oldConfigItem = configListContainer.querySelector(`.custom-config-item[data-name="${this.config.name}"]`);
                    if (oldConfigItem) oldConfigItem.remove();
                }
                
                // 创建新的配置项
                const configItem = configListContainer.createDiv({
                    cls: 'custom-config-item',
                    attr: {
                        'data-name': updatedConfig.name,
                        style: 'display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 8px; border-radius: 4px; background: var(--background-primary-alt);'
                    }
                });
                
                // 配置信息区域
                const configInfo = configItem.createDiv({
                    cls: 'custom-config-info',
                    attr: {
                        style: 'flex-grow: 1;'
                    }
                });
                
                configInfo.createEl('span', { 
                    text: updatedConfig.name,
                    attr: {
                        style: 'font-weight: bold;'
                    }
                });
                
                const configDetails = configInfo.createEl('div', {
                    cls: 'custom-config-details',
                    attr: {
                        style: 'font-size: 0.85em; color: var(--text-muted); margin-top: 4px;'
                    }
                });
                
                configDetails.createEl('div', { 
                    text: `API: ${updatedConfig.apiKey.substring(0, 15)}...`
                });
                
                configDetails.createEl('div', { 
                    text: `URL: ${updatedConfig.baseUrl}`
                });
                
                configDetails.createEl('div', { 
                    text: `模型: ${updatedConfig.model}`
                });
                
                configDetails.createEl('div', { 
                    text: `代理: ${updatedConfig.useProxy ? '开启' : '关闭'}`
                });
                
                // 配置操作按钮容器
                const configActions = configItem.createDiv({
                    cls: 'custom-config-actions',
                    attr: {
                        style: 'display: flex; gap: 4px;'
                    }
                });
                
                // 应用按钮
                const applyButton = configActions.createEl('button', {
                    text: '应用',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                applyButton.addEventListener('click', async () => {
                    this.plugin.settings.currentApiKey = updatedConfig.apiKey;
                    this.plugin.settings.currentBaseUrl = updatedConfig.baseUrl;
                    this.plugin.settings.currentModel = updatedConfig.model;
                    this.plugin.settings.useProxy = updatedConfig.useProxy;
                    this.plugin.settings.proxyUrl = updatedConfig.proxyUrl;
                    this.plugin.settings.currentCustomConfig = updatedConfig.name;
                    this.plugin.settings.useStreaming = updatedConfig.useStreaming; // 添加流式模式设置
                    await this.plugin.saveSettings();
                    
                    // 刷新设置面板
                    settingTab.display();
                });
                
                // 编辑按钮
                const editButton = configActions.createEl('button', {
                    text: '编辑',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--interactive-normal); border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                editButton.addEventListener('click', () => {
                    const modal = new ConfigEditModal(this.app, this.plugin, updatedConfig);
                    modal.open();
                });
                
                // 删除按钮
                const deleteButton = configActions.createEl('button', {
                    text: '删除',
                    attr: {
                        style: 'padding: 4px 8px; background: var(--background-modifier-error); color: white; border-radius: 4px; font-size: 0.85em;'
                    }
                });
                
                deleteButton.addEventListener('click', async () => {
                    // 先从DOM中移除当前配置项
                    configItem.remove();
                    
                    // 从设置中移除该配置
                    this.plugin.settings.customConfigs = this.plugin.settings.customConfigs.filter(c => c.name !== updatedConfig.name);
                    
                    // 如果删除的是当前选中的配置，重置当前配置
                    if (this.plugin.settings.currentCustomConfig === updatedConfig.name) {
                        this.plugin.settings.currentCustomConfig = '';
                    }
                    
                    // 保存设置
                    await this.plugin.saveSettings();
                    
                    // 如果删除后没有预设了，显示提示文本
                    if (this.plugin.settings.customConfigs.length === 0) {
                        configListContainer.remove();
                        
                        configSectionContainer.createEl('p', {
                            text: '尚未创建自定义配置。点击"添加配置"按钮创建一个新配置。',
                            attr: {
                                style: 'color: var(--text-muted); font-style: italic; margin-top: 8px;'
                            }
                        });
                    }
                    
                    // 更新所有打开的ChatView视图
                    this.plugin.updateAllChatViews();
                    
                    new Notice(`配置 "${updatedConfig.name}" 已删除`);
                });
                
                // 如果是新配置，滚动到底部以确保新添加的配置可见
                if (this.isNewConfig) {
                    setTimeout(() => {
                        configItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                }
            }
        }
    }
    
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}


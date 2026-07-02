import { getClientConfig } from "../config/client";

const ENTER_KEY = "Enter";

const isApp = !!getClientConfig()?.isApp;

const cn = {
  WIP: "该功能仍在开发中……",
  Error: {
    Mermaid: "Mermaid 语法有误，已保留源码。",
    Unauthorized: isApp
      ? `😆 对话遇到了一些问题，不用慌:
       \\ 1️⃣ 想要零配置开箱即用，请使用 Chat AI
       \\ 2️⃣ 如果你想消耗自己的 OpenAI 资源，点击[这里](/#/settings)修改设置 ⚙️`
      : `😆 对话遇到了一些问题，不用慌:
       \ 1️⃣ 想要零配置开箱即用，请使用 Chat AI
       \ 2️⃣ 如果你需要完成账号授权，点击[这里](/#/auth)继续登录 🔑
       \ 3️⃣ 如果你想消耗自己的 OpenAI 资源，点击[这里](/#/settings)修改设置 ⚙️
       `,
  },
  Auth: {
    Return: "返回",
    Title: "登录授权",
    Tips: "使用区块链地址完成授权登录",
    SubTips: "可使用钱包签名或中心化 UCAN 授权",
    Input: "输入或选择区块链地址",
    Confirm: "登录",
    Later: "稍后再说",
    Processing: "处理中...",
    EmptyHistory: "暂无历史地址",
    ClearSelection: "清空当前选择",
    ExpandAccountList: "展开地址列表",
    MissingAccount: "请先输入或选择区块链地址",
    MissingWalletAccount: "未获取到账户",
    LoginCancelled: "已取消登录",
    SwitchToAppAccount: "请先在钱包中切换到应用地址，然后重新点击登录",
    WalletLoginFailed: (error: string) => `钱包登录失败: ${error}`,
    MissingRouterAudience:
      "无法解析 Router audience，请检查 ROUTER_BACKEND_URL",
    CentralLoginSuccess: "中心化 UCAN 登录成功",
    CentralExchangeFailed: (error: string) => `中心化授权码兑换失败: ${error}`,
    CentralRequestCreated: "已创建中心化授权请求，跳转认证页",
    CentralRequestFailed: (error: string) => `创建中心化授权请求失败: ${error}`,
    WalletMismatch: {
      Title: "账户不一致",
      Description: "应用地址和钱包地址不一致，请选择登录方式。",
      App: "应用",
      Wallet: "钱包",
      Switch: "去钱包切换",
      UseWallet: "使用钱包当前地址",
    },
    TopTips:
      "🥳 Chat AI 首发，立刻解锁 qwen3.7-plus、deepseek-v4-pro、gpt-5.5、claude-4.8等最新大模型",
  },
  ChatItem: {
    ChatItemCount: (count: number) => `${count} 条对话`,
  },
  Chat: {
    SubTitle: (count: number) => `共 ${count} 条对话`,
    EditMessage: {
      Title: "编辑消息记录",
      Topic: {
        Title: "聊天主题",
        SubTitle: "更改当前聊天主题",
      },
    },
    Actions: {
      ChatList: "查看会话列表",
      CompressedHistory: "查看压缩后的历史 Prompt",
      Export: "导出聊天记录",
      Copy: "复制",
      Stop: "停止",
      Retry: "重试",
      Pin: "固定",
      PinToastContent: "已将 1 条对话固定至预设提示词",
      PinToastAction: "查看",
      Delete: "删除",
      Edit: "编辑",
      FullScreen: "全屏",
      RefreshTitle: "刷新标题",
      RefreshToast: "已发送刷新标题请求",
      Speech: "朗读",
      StopSpeech: "停止",
    },
    Commands: {
      new: "新建聊天",
      newm: "选择技能新建聊天",
      next: "下一个聊天",
      prev: "上一个聊天",
      clear: "清除上下文",
      fork: "复制聊天",
      del: "删除聊天",
    },
    InputActions: {
      Stop: "停止响应",
      ToBottom: "滚到最新",
      Theme: {
        auto: "自动主题",
        light: "亮色模式",
        dark: "深色模式",
      },
      Prompt: "快捷指令",
      Masks: "技能",
      Clear: "清除聊天",
      Settings: "对话设置",
      UploadImage: "上传图片",
    },
    Rename: "重命名对话",
    Typing: "正在输入…",
    Input: (submitKey: string) => {
      var inputHints = `${submitKey} 发送`;
      if (submitKey === ENTER_KEY) {
        inputHints += "，Shift + Enter 换行";
      }
      return inputHints + "，/ 触发补全，: 触发命令";
    },
    Send: "发送",
    StartSpeak: "说话",
    StopSpeak: "停止",
    Config: {
      Reset: "清除记忆",
    },
    IsContext: "预设提示词",
    ShortcutKey: {
      Title: "键盘快捷方式",
      newChat: "打开新聊天",
      focusInput: "聚焦输入框",
      copyLastMessage: "复制最后一个回复",
      copyLastCode: "复制最后一个代码块",
      showShortcutKey: "显示快捷方式",
      clearContext: "清除上下文",
    },
    RouterPrompt: {
      Action: "前往 Router",
      MissingToken:
        "当前还没有可用令牌，请前往 Router 选择或充值令牌后再开始对话",
      DisabledToken: "当前令牌已被禁用，请前往 Router 重新选择可用令牌",
      ExpiredToken: "当前令牌已过期，请前往 Router 更换或充值后继续使用",
      DepletedToken: "当前令牌额度不足，请前往 Router 充值后继续使用",
      NoTextModels:
        "当前令牌还没有返回可用文本模型，请前往 Router 检查令牌额度、模型权限或重新选择令牌",
      NoSkillModels:
        "该技能当前没有匹配到可用模型，请前往 Router 检查技能候选模型和令牌支持范围",
      DefaultModelUnavailable:
        "技能默认模型当前不可用，请切换到当前令牌支持的模型，或前往 Router 调整令牌配置",
    },
  },
  Export: {
    Title: "分享聊天记录",
    Copy: "全部复制",
    Download: "下载文件",
    Share: "分享到 ShareGPT",
    MessageFromYou: "用户",
    MessageFromChatGPT: "ChatGPT",
    Format: {
      Title: "导出格式",
      SubTitle: "可以导出 Markdown 文本或者 PNG 图片",
    },
    IncludeContext: {
      Title: "包含技能上下文",
      SubTitle: "是否在消息中展示技能预设上下文",
    },
    Steps: {
      Select: "选取",
      Preview: "预览",
    },
    Image: {
      Toast: "正在生成截图",
      Modal: "查看图片",
    },
    Artifacts: {
      Title: "分享页面",
      Error: "分享失败",
    },
  },
  Select: {
    Search: "搜索消息",
    All: "选取全部",
    Latest: "最近几条",
    Clear: "清除选中",
  },
  Memory: {
    Title: "历史摘要",
    EmptyContent: "对话内容过短，无需总结",
    Send: "自动压缩聊天记录并作为上下文发送",
    Copy: "复制摘要",
    Reset: "[unused]",
    ResetConfirm: "确认清空历史摘要？",
  },
  Home: {
    NewChat: "会话",
    DeleteChat: "确认删除选中的对话？",
    DeleteToast: "已删除会话",
    Revert: "撤销",
  },
  OWNER_CENTER: {
    MyPage: "个人中心",
  },
  Settings: {
    Title: "设置",
    SubTitle: "所有设置选项",
    ShowPassword: "显示密码",

    Account: {
      Address: {
        Title: "区块链地址",
      },
      Logout: {
        Title: "退出登录",
        SubTitle: "断开当前钱包账号，并清除本地授权会话。",
        Action: "退出",
      },
    },
    Danger: {
      Reset: {
        Title: "重置所有设置",
        SubTitle: "重置所有设置项回默认值",
        Action: "立即重置",
        Confirm: "确认重置所有设置？",
      },
      Clear: {
        Title: "清除所有数据",
        SubTitle: "清除所有聊天、设置数据",
        Action: "立即清除",
        Confirm: "确认清除所有聊天、设置数据？",
      },
    },
    Lang: {
      Name: "Language", // 注意：如果要添加新的翻译，请不要翻译此值，将它保留为 `Language`
      All: "所有语言",
    },
    Avatar: "头像",
    FontSize: {
      Title: "字体大小",
      SubTitle: "聊天内容的字体大小",
    },
    FontFamily: {
      Title: "聊天字体",
      SubTitle: "聊天内容的字体，若置空则应用全局默认字体",
      Placeholder: "字体名称",
    },
    InjectSystemPrompts: {
      Title: "注入系统级提示信息",
      SubTitle: "强制给每次请求的消息列表开头添加一个模拟 ChatGPT 的系统提示",
    },
    InputTemplate: {
      Title: "用户输入预处理",
      SubTitle: "用户最新的一条消息会填充到此模板",
    },

    Update: {
      Version: (x: string) => `当前版本：${x}`,
      IsLatest: "已是最新版本",
      CheckUpdate: "检查更新",
      IsChecking: "正在检查更新...",
      FoundUpdate: (x: string) => `发现新版本：${x}`,
      GoToUpdate: "前往更新",
      Success: "更新成功！",
      Failed: "更新失败",
    },
    SendKey: "发送键",
    Theme: "主题",
    TightBorder: "无边框模式",
    SendPreviewBubble: {
      Title: "预览气泡",
      SubTitle: "在预览气泡中预览 Markdown 内容",
    },
    AutoGenerateTitle: {
      Title: "自动生成标题",
      SubTitle: "根据对话内容生成合适的标题",
    },
    Sync: {
      NotSyncYet: "还没有进行过同步",
      Success: "同步成功",
      Fail: "同步失败",

      Config: {
        SyncType: {
          Title: "同步类型",
          SubTitle: "选择喜爱的同步服务器",
        },
        AutoSync: {
          Title: "自动同步",
        },
        AutoSyncInterval: {
          Title: "自动同步间隔（分钟）",
        },
        Proxy: {
          Title: "启用代理",
          SubTitle: "在浏览器中同步时，必须启用代理以避免跨域限制",
        },
        ProxyUrl: {
          Title: "代理地址",
          SubTitle: "仅适用于本项目自带的跨域代理",
        },

        WebDav: {
          Endpoint: "WebDAV 地址",
          BaseUrl: "WebDAV 基础地址",
          BaseUrlSubTitle: "不含路径，例如 https://webdav.example.com",
          Prefix: "WebDAV 前缀",
          PrefixSubTitle: "默认 /dav，可修改",
          UcanBaseUrl: "WebDAV 后端基础地址",
          UcanPrefix: "WebDAV 后端前缀",
          AuthType: "WebDAV 授权方式",
          UserName: "用户名",
          Password: "密码",
        },

        UpStash: {
          Endpoint: "UpStash Redis REST 地址",
          UserName: "备份名称",
          Password: "UpStash Redis REST 令牌",
        },
      },

      Overview: (overview: any) => {
        const skillCount = overview.skill ?? overview.mask ?? 0;
        return `${overview.chat} 次对话，${overview.message} 条消息，${overview.prompt} 条提示词，${skillCount} 个技能`;
      },
      ImportFailed: "导入失败",
    },
    Mask: {
      Splash: {
        Title: "技能选择页",
        SubTitle: "新建聊天时，展示技能选择页",
      },
      Builtin: {
        Title: "隐藏内置技能",
        SubTitle: "在技能列表中隐藏内置技能",
      },
    },
    Prompt: {
      Disable: {
        Title: "禁用快捷语自动补全",
        SubTitle: "在输入框开头输入 / 可触发用户自定义快捷语",
      },
      List: "快捷语列表",
      ListCount: (builtin: number, custom: number) =>
        `兼容内置 ${builtin} 条，用户自定义 ${custom} 条`,
      Edit: "编辑",
      Modal: {
        Title: "快捷语列表",
        Add: "新建",
        Search: "搜索快捷语",
      },
      EditModal: {
        Title: "编辑快捷语",
      },
    },
    HistoryCount: {
      Title: "附带历史消息数",
      SubTitle: "每次请求携带的历史消息数",
    },
    CompressThreshold: {
      Title: "历史消息长度压缩阈值",
      SubTitle: "当未压缩的历史消息超过该值时，将进行压缩",
    },

    Usage: {
      Title: "余额查询",
      SubTitle(used: any, total: any) {
        return `本月已使用 $${used}，订阅总额 $${total}`;
      },
      IsChecking: "正在检查…",
      Check: "重新检查",
      NoAccess: "选择令牌或填写 API Key 后查看余额",
    },

    Access: {
      SaasStart: {
        Title: "使用 Chat AI",
        Label: "（性价比最高的方案）",
        SubTitle:
          "由 Chat 官方维护, 零配置开箱即用，支持 OpenAI o1, GPT-4o, Claude-3.5 等最新大模型",
        ChatNow: "",
      },
      AccessCode: {
        Title: "访问密码",
        SubTitle: "已开启加密访问",
        Placeholder: "请输入访问密码",
      },
      CustomEndpoint: {
        Title: "自定义接口",
        SubTitle: "是否使用自定义 Azure 或 OpenAI 服务",
      },
      Provider: {
        Title: "模型服务商",
        SubTitle: "切换不同的服务商",
      },
      OpenAI: {
        ApiKey: {
          Title: "API Key",
          SubTitle: "使用自定义 OpenAI Key 绕过密码访问限制",
          Placeholder: "OpenAI API Key",
        },

        Endpoint: {
          Title: "接口地址",
          SubTitle: "除默认地址外，必须包含 http(s)://",
        },
      },
      Azure: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义 Azure Key 绕过密码访问限制",
          Placeholder: "Azure API Key",
        },

        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },

        ApiVerion: {
          Title: "接口版本 (azure api version)",
          SubTitle: "选择指定的部分版本",
        },
      },
      Anthropic: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义 Anthropic Key 绕过密码访问限制",
          Placeholder: "Anthropic API Key",
        },

        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },

        ApiVerion: {
          Title: "接口版本 (claude api version)",
          SubTitle: "选择一个特定的 API 版本输入",
        },
      },
      Google: {
        ApiKey: {
          Title: "API 密钥",
          SubTitle: "从 Google AI 获取您的 API 密钥",
          Placeholder: "Google AI API KEY",
        },

        Endpoint: {
          Title: "终端地址",
          SubTitle: "示例：",
        },

        ApiVersion: {
          Title: "API 版本（仅适用于 gemini-pro）",
          SubTitle: "选择一个特定的 API 版本",
        },
        GoogleSafetySettings: {
          Title: "Google 安全过滤级别",
          SubTitle: "设置内容过滤级别",
        },
      },
      Baidu: {
        ApiKey: {
          Title: "API Key",
          SubTitle: "使用自定义 Baidu API Key",
          Placeholder: "Baidu API Key",
        },
        SecretKey: {
          Title: "Secret Key",
          SubTitle: "使用自定义 Baidu Secret Key",
          Placeholder: "Baidu Secret Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "不支持自定义前往.env配置",
        },
      },
      Tencent: {
        ApiKey: {
          Title: "API Key",
          SubTitle: "使用自定义腾讯云API Key",
          Placeholder: "Tencent API Key",
        },
        SecretKey: {
          Title: "Secret Key",
          SubTitle: "使用自定义腾讯云Secret Key",
          Placeholder: "Tencent Secret Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "不支持自定义前往.env配置",
        },
      },
      Volcengine: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义 volcengine API Key",
          Placeholder: "volcengine API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      Alibaba: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义阿里云API Key",
          Placeholder: "Alibaba Cloud API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      Moonshot: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义月之暗面API Key",
          Placeholder: "Moonshot API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      DeepSeek: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义DeepSeek API Key",
          Placeholder: "DeepSeek API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      XAI: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义XAI API Key",
          Placeholder: "XAI API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      ChatGLM: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义 ChatGLM API Key",
          Placeholder: "ChatGLM API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      SiliconFlow: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义硅基流动 API Key",
          Placeholder: "硅基流动 API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      Stability: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义 Stability API Key",
          Placeholder: "Stability API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      Iflytek: {
        ApiKey: {
          Title: "ApiKey",
          SubTitle: "从讯飞星火控制台获取的 APIKey",
          Placeholder: "APIKey",
        },
        ApiSecret: {
          Title: "ApiSecret",
          SubTitle: "从讯飞星火控制台获取的 APISecret",
          Placeholder: "APISecret",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
      CustomModel: {
        Title: "自定义模型名",
        SubTitle: "增加自定义模型可选项，使用英文逗号隔开",
      },
      AI302: {
        ApiKey: {
          Title: "接口密钥",
          SubTitle: "使用自定义302.AI API Key",
          Placeholder: "302.AI API Key",
        },
        Endpoint: {
          Title: "接口地址",
          SubTitle: "样例：",
        },
      },
    },

    Model: "模型 (model)",
    CompressModel: {
      Title: "对话摘要模型",
      SubTitle: "用于压缩历史记录、生成对话标题的模型",
      Auto: "自动选择",
    },
    Temperature: {
      Title: "随机性 (temperature)",
      SubTitle: "值越大，回复越随机",
    },
    TopP: {
      Title: "核采样 (top_p)",
      SubTitle: "与随机性类似，但不要和随机性一起更改",
    },
    MaxTokens: {
      Title: "单次回复限制 (max_tokens)",
      SubTitle: "单次交互所用的最大 Token 数",
    },
    PresencePenalty: {
      Title: "话题新鲜度 (presence_penalty)",
      SubTitle: "值越大，越有可能扩展到新话题",
    },
    FrequencyPenalty: {
      Title: "频率惩罚度 (frequency_penalty)",
      SubTitle: "值越大，越有可能降低重复字词",
    },
    TTS: {
      Enable: {
        Title: "启用文本转语音",
        SubTitle: "启用文本生成语音服务",
      },
      Autoplay: {
        Title: "启用自动朗读",
        SubTitle: "自动生成语音并播放，需先开启文本转语音开关",
      },
      Model: "模型",
      Engine: "转换引擎",
      Voice: {
        Title: "声音",
        SubTitle: "生成语音时使用的声音",
      },
      Speed: {
        Title: "速度",
        SubTitle: "生成语音的速度",
      },
    },
    Realtime: {
      Enable: {
        Title: "实时聊天",
        SubTitle: "开启实时聊天功能",
      },
      Provider: {
        Title: "模型服务商",
        SubTitle: "切换不同的服务商",
      },
      Model: {
        Title: "模型",
        SubTitle: "选择一个模型",
      },
      ApiKey: {
        Title: "API Key",
        SubTitle: "API Key",
        Placeholder: "API Key",
      },
      Router: {
        Endpoint: {
          Title: "Router 地址",
          SubTitle: "留空则使用 Router 页面或运行时配置里的地址",
          Placeholder: "https://llm.yeying.pub",
        },
        Token: {
          Title: "Router 令牌",
          SubTitle: "留空则使用 Router 页面选中的令牌",
          Placeholder: "Router 令牌，可留空",
        },
      },
      Azure: {
        Endpoint: {
          Title: "接口地址",
          SubTitle: "接口地址",
        },
        Deployment: {
          Title: "部署名称",
          SubTitle: "部署名称",
        },
      },
      Temperature: {
        Title: "随机性 (temperature)",
        SubTitle: "值越大，回复越随机",
      },
    },
  },
  Store: {
    DefaultTopic: "通用问答",
    BotHello: "有什么可以帮你的吗",
    Error: "出错了，稍后重试吧",
    Prompt: {
      History: (content: string) => "这是历史聊天总结作为前情提要：" + content,
      Topic:
        "使用四到五个字直接返回这句话的简要主题，不要解释、不要标点、不要语气词、不要多余文本，不要加粗，如果没有主题，请直接返回“闲聊”",
      Summarize:
        "简要总结一下对话内容，用作后续的上下文提示 prompt，控制在 200 字以内",
    },
  },
  Copy: {
    Success: "已写入剪贴板",
    Failed: "复制失败，请赋予剪贴板权限",
  },
  Download: {
    Success: "内容已下载到您的目录。",
    Failed: "下载失败。",
  },
  Context: {
    Toast: (x: any) => `包含 ${x} 条预设提示词`,
    Edit: "当前对话设置",
    Add: "新增一条对话",
    Clear: "上下文已清除",
    Revert: "恢复上下文",
  },
  Discovery: {
    Name: "发现",
    Page: {
      Title: "发现",
      SubTitle: "技能直接使用或配置，工具可安装、配置和管理",
    },
    Types: {
      all: "全部",
      skill: "技能",
      tool: "工具",
      provider: "模型服务商",
      storage: "存储",
    },
    Status: {
      Enabled: "已启用",
      Available: "可用",
      Installed: "已安装",
      Configurable: "可配置",
      Unavailable: "不可用",
      Paused: "已暂停",
      Error: "异常",
    },
    Pricing: {
      free: "免费",
      subscription: "订阅",
      usage: "按量",
    },
    Runtime: {
      cloud: "云端",
      local: "本地",
      both: "云端 / 本地",
    },
    Source: {
      Official: "官方",
      Community: "社区",
      Custom: "自定义",
      Provider: "模型服务商",
    },
    SourceLabel: "来源",
    ToolStatus: "工具状态",
    ConfigMode: "配置模式",
    ToolUserProvided: "用户自带工具配置",
    ToolUserConfigHint:
      "工具支持 cloud / native 两种运行方式。Web 版普通用户通常直接使用云端能力；桌面版或自托管环境可在本地安装、配置和管理。当前这个配置面板写入的是本地工具运行配置，请只在可信环境中使用。",
    OpenToolManager: "打开工具管理",
    Manage: "管理",
    Configure: "配置",
    Enable: "启用",
    ConfigureAndEnable: "配置并启用",
    Install: "安装",
    Use: "开始使用",
    MyCapabilities: "我的能力",
    BackToMarket: "返回市场",
    SearchMarket: "搜索技能、工具、模型、存储",
    SearchMine: "搜索我的能力",
    Empty: "没有找到匹配的能力",
    ResetFilters: "清空筛选",
    DefaultSkillDesc:
      "面向任务的工作方式，可绑定模型、提示词和工具；技能本身无需安装。",
    SkillStarters: (count: number) => `${count} 个开场白`,
    SkillTools: (count: number) => `${count} 个绑定工具`,
    RouterProviderTitle: "社区 Router",
    RouterProviderDesc: "默认模型服务商，统一接入社区可用模型。",
    CloudStorageTitle: "云端存储",
    CloudStorageDesc: "管理聊天、技能等本地数据的云端同步和空间使用情况。",
    StorageAppSync: "应用同步",
    NoImageModels: "当前没有可用图片模型",
    StorageQuotaUsage: (used: string, quota: string) =>
      `已用 ${used} / ${quota}`,
    StorageQuotaUnlimited: (used: string) => `已用 ${used} / 无限空间`,
    ProviderDesc: (available: number, total: number, tags: string[]) =>
      tags.length > 0
        ? `${available}/${total} 个模型可用 · ${tags.join(" / ")}`
        : `${available}/${total} 个模型可用`,
    ToolTitle: "工具",
    ToolDesc:
      "连接搜索、抓取、文件、Git、时间等工具能力。工具支持云端托管或本地安装配置。",
  },
  Tool: {
    Name: "工具",
  },
  FineTuned: {
    Sysmessage: "你是一个助手",
  },
  SearchChat: {
    Name: "搜索聊天记录",
    Page: {
      Title: "搜索聊天记录",
      Search: "输入搜索关键词",
      NoResult: "没有找到结果",
      NoData: "没有数据",
      Loading: "加载中",

      SubTitle: (count: number) => `搜索到 ${count} 条结果`,
    },
    Item: {
      View: "查看",
    },
  },
  Plugin: {
    Name: "OpenAPI 导入",
    Page: {
      Title: "OpenAPI 导入",
      SubTitle: (count: number) => `${count} 个 OpenAPI 接口`,
      Search: "搜索 OpenAPI 接口",
      Create: "新建",
      Find: "通过 OpenAPI 描述导入 HTTP 接口，后续可适配为工具：",
    },
    Item: {
      Info: (count: number) => `${count} 方法`,
      View: "查看",
      Edit: "编辑",
      Delete: "删除",
      DeleteConfirm: "确认删除？",
    },
    Auth: {
      None: "不需要授权",
      Basic: "Basic",
      Bearer: "Bearer",
      Custom: "自定义",
      CustomHeader: "自定义参数名称",
      Token: "Token",
      Proxy: "使用代理",
      ProxyDescription: "使用代理解决 CORS 错误",
      Location: "位置",
      LocationHeader: "Header",
      LocationQuery: "Query",
      LocationBody: "Body",
    },
    EditModal: {
      Title: (readonly: boolean) =>
        `编辑 OpenAPI 导入 ${readonly ? "（只读）" : ""}`,
      Download: "下载",
      Auth: "授权方式",
      Content: "OpenAPI Schema",
      Load: "从网页加载",
      Method: "方法",
      Error: "格式错误",
    },
  },
  Wallet: {
    CollectWallet: "连接钱包",
  },
  Skill: {
    Name: "技能",
    Package: {
      Title: "技能包配置",
      Labels: {
        runtime: "运行方式",
        model: "模型",
        permissions: "权限",
        tools: "工具",
        visibility: "可见范围",
        version: "版本",
        chat: "会话",
        sd: "图片创作",
        external: "外部入口",
        globalModel: "跟随全局模型",
        none: "无",
        noExtraPermissions: "无需额外权限",
        public: "公开",
        organization: "组织",
        private: "私有",
      },
    },
    Page: {
      Title: "技能",
      SubTitle: (count: number) => `${count} 个技能`,
      Search: "搜索技能",
      Create: "新建本地技能",
      AllCategories: "全部",
      Empty: "没有找到匹配的技能",
      BuiltinSection: "内置技能",
      BuiltinSectionDesc:
        "官方提供，开箱即用；如需调整，可复制为本地技能后配置",
      LocalSection: "本地技能",
      LocalSectionDesc: "你在当前实例中创建、导入或复制的技能配置",
      BuiltinEmpty: "没有匹配的内置技能",
      LocalEmpty: "没有匹配的本地技能",
    },
    Item: {
      Info: (count: number) => `包含 ${count} 条预设对话`,
      Chat: "对话",
      View: "查看",
      Edit: "编辑",
      Delete: "删除",
      DeleteConfirm: "确认删除？",
    },
    EditModal: {
      Title: (readonly: boolean) => `编辑技能 ${readonly ? "（只读）" : ""}`,
      Download: "下载技能",
      Clone: "复制为本地技能",
    },
    Config: {
      Avatar: "角色头像",
      Name: "角色名称",
      CandidateModels: {
        Title: "候选模型",
        SubTitle: "通过这个技能创建的会话，仅可使用这些模型",
        SummaryNone: "不限制",
        SummarySelected: (count: number) => `已选择 ${count} 个模型`,
      },
      Tools: {
        SummaryNone: "未选择",
        SummarySelected: (count: number) => `已选择 ${count} 个`,
        BuiltIn: {
          Title: "内置工具",
          SubTitle: "模型平台提供的能力，例如 Web Search",
        },
        ToolServers: {
          Title: "工具",
          SubTitle: "限制这个技能可调用的工具服务；未选择表示不限制",
        },
        NativeToolBridge: {
          Title: "工具策略",
          SubTitle:
            "用于深度思考等技能；开启后模型可调用 Brave/fetch 等已连接工具，关闭后仅使用模型自身能力",
        },
      },
      Sync: {
        Title: "使用全局设置",
        SubTitle: "当前对话是否使用全局模型设置",
        Confirm: "当前对话的自定义设置将会被自动覆盖，确认启用全局设置？",
      },
      HideContext: {
        Title: "隐藏预设对话",
        SubTitle: "隐藏后预设对话不会出现在聊天界面",
      },
      Artifacts: {
        Title: "启用Artifacts",
        SubTitle: "启用之后可以直接渲染HTML页面",
      },
      CodeFold: {
        Title: "启用代码折叠",
        SubTitle: "启用之后可以自动折叠/展开过长的代码块",
      },
      Share: {
        Title: "分享此技能",
        SubTitle: "生成此技能的直达链接",
        Action: "复制链接",
      },
    },
  },
  NewChat: {
    Return: "返回",
    Skip: "直接开始",
    NotShow: "不再展示",
    ConfirmNoShow: "确认禁用？禁用后可以随时在设置中重新启用。",
    Title: "新建聊天",
    SubTitle: "直接开始，或为当前任务选择一个技能",
    Placeholder: "输入想法，开始会话",
    BlankTitle: "对话",
    BlankSubTitle: "不使用预设技能，直接进入对话。",
    ImageTitle: "图片创作",
    RecentTitle: "最近使用",
    FeaturedTitle: "技能",
    FeaturedSubTitle: "技能会带上适合当前任务的提示词和模型参数。",
    More: "全部",
    EmptySkills: "暂无可用技能",
    ExploreSkills: "去发现",
    ModelPlaceholder: "请选择模型",
    Router: {
      SetupTitle: "先开通可用令牌，再开始对话",
      NoModelTitle: "当前还没有可用文本模型",
      SetupDesc: "前往 Router 选择或充值令牌后，返回 Chat 即可立即开始体验。",
      DisabledDesc: "当前令牌已被禁用，请前往 Router 重新选择可用令牌。",
      ExpiredDesc: "当前令牌已过期，请前往 Router 更换或充值后继续使用。",
      DepletedDesc: "当前令牌额度不足，请前往 Router 充值后继续使用。",
      NoModelDesc:
        "当前令牌还没有返回可用文本模型，请前往 Router 检查令牌额度、模型权限或重新选择令牌。",
      OpenRouter: "前往 Router",
    },
  },
  Setup: {
    Title: "模型配置",
    SubTitle: "当前工作区还不能开始对话，请先完成 Router 或模型访问配置。",
    Purchase: "购买",
    OpenCommunityRouter: "设置 Router",
  },

  Router: {
    RefreshModels: "刷新模型",
    ReturnToChat: "前往 Chat",
    ReturnToNewChat: "前往新建会话",
    Banner: {
      SelectTitle: "先选择一个可用令牌",
      SelectDesc:
        "选择令牌后，Chat 会立即使用该令牌加载文本、图片和实时语音模型。",
      SelectPrimary: "前往令牌中心",
      SelectSecondary: "返回 Chat",
      RechargeTitle: "当前令牌额度不足",
      RechargeDesc:
        "请前往 Router 管理中心充值或更换令牌，完成后回到 Chat 即可继续使用。",
      RechargePrimary: "前往充值",
      RechargeSecondary: "重新检查",
      RenewTitle: "当前令牌已过期",
      RenewDesc:
        "请在 Router 管理中心续费或切换到新的可用令牌，然后回到 Chat 继续使用。",
      RenewPrimary: "前往管理中心",
      RenewSecondary: "重新检查",
      DisabledTitle: "当前令牌不可用",
      DisabledDesc:
        "这个令牌已被禁用或失效，请重新选择一个可用令牌后再回到 Chat。",
      DisabledPrimary: "重新选择令牌",
      DisabledSecondary: "返回 Chat",
      TokenTitle: "完成 Router 配置后即可开始使用",
      TokenDesc:
        "优先选择一个可用令牌；如果模型或额度状态刚刚变化，可以先重新检查一次。",
      TokenPrimary: "重新检查",
      TokenSecondary: "返回 Chat",
    },
    Status: {
      Title: "Router 状态",
      SubTitle: "当前令牌状态和账户使用情况。",
      TokenReady: "模型令牌 已选择",
      TokenMissing: "模型令牌 未选择",
      UsageReady: "余额查询 可用",
      UsagePending: "余额查询 未就绪",
      Checking: "检查中",
      TokenName: "当前令牌",
      AvailableQuota: "可用额度",
      UsedQuota: "已使用",
      ExpiresAt: "过期时间",
      NotSelected: "未选择",
      Unlimited: "无限",
      Unavailable: "未获取",
      NotSet: "未设置",
    },
    Config: {
      Title: "Router 配置",
      SubTitle: "接入地址和默认模型令牌。",
      Endpoint: "接口地址",
      EndpointHint: (url: string) => `默认地址：${url}`,
      Token: "令牌",
      UnnamedToken: "未命名",
      TokensLoading: "令牌加载中",
      NoTokens: "未找到可用令牌",
      TokenHint: "文本、图片、语音和模型列表都会优先使用这里选择的令牌。",
    },
    Models: {
      Title: "支持模型",
      SubTitle: "当前令牌可用的模型。",
      SearchPlaceholder: "搜索模型名、供应商、端点",
      Filters: {
        all: "全部",
        text: "文本",
        image: "图片",
        reasoning: "深度思考",
      },
      Headers: {
        Model: "模型",
        Provider: "供应商",
        Capabilities: "能力",
        Endpoints: "端点",
      },
      Capabilities: {
        Text: "文本",
        Vision: "识图",
        Image: "生图",
        Edit: "编辑",
        Reasoning: "深度思考",
        General: "通用",
      },
      EmptyEndpoint: "未声明端点",
      Loading: "模型加载中",
      EmptyWithToken: "当前令牌没有返回可用模型",
      EmptyWithoutToken: "请选择令牌后加载模型",
    },
  },

  URLCommand: {
    Code: "检测到链接中包含授权参数，是否继续处理？",
    Settings: "检测到链接中包含了预制设置，是否自动填入？",
  },

  UI: {
    Confirm: "确认",
    Cancel: "取消",
    Close: "关闭",
    Create: "新建",
    Edit: "编辑",
    Export: "导出",
    Import: "导入",
    Sync: "同步",
    Config: "配置",
  },
  Exporter: {
    Description: {
      Title: "只有清除上下文之后的消息会被展示",
    },
    Model: "模型",
    Messages: "消息",
    Topic: "主题",
    Time: "时间",
  },
  SdPanel: {
    Mode: "模式",
    SourceType: "图片来源",
    UploadImage: "上传图片",
    MaskImage: "上传遮罩",
    MaskImageSubTitle: "透明区域会被重新生成；也可以直接打开画笔涂抹生成遮罩。",
    DrawMask: "涂抹遮罩",
    ClearMask: "清空遮罩",
    SaveMask: "保存遮罩",
    MaskOverlay: "遮罩显示",
    MaskInteractionMode: "操作模式",
    MaskZoom: "缩放",
    ResetZoom: "重置缩放",
    MaskBrushMode: "画笔模式",
    MaskBrushSize: "画笔大小",
    MaskSaved: "已保存",
    MaskUnsaved: "未保存",
    MaskShortcutHint:
      "滚轮或双指滚动用于移动视图，按住 Ctrl 或 Command 再滚动可缩放，按住空格可临时拖动画布。",
    MaskDrawSubTitle: "在图片上涂抹需要重绘的区域，保存后会生成透明遮罩。",
    ModelSelectorTitle: "选择图片模型",
    ModelSelectorSearch: "搜索模型名称或提供方",
    ModelSelectorAction: "切换",
    SubmitSummaryGenerate: "准备根据当前提示词生成新图片。",
    SubmitSummaryReady: "原图与遮罩已就绪，将仅在遮罩区域执行编辑。",
    SubmitSummaryNoMask: "已选择原图，但未附加遮罩；部分模型可能按整图编辑。",
    MaskCloseConfirm: "当前遮罩尚未保存，确认关闭吗？",
    MaskInteractionModes: {
      Draw: "绘制",
      Pan: "平移",
    },
    MaskOverlayModes: {
      Show: "显示遮罩",
      Hide: "隐藏遮罩",
    },
    MaskBrushModes: {
      Erase: "重绘区域",
      Restore: "恢复区域",
    },
    Provider: "提供商",
    Prompt: "画面提示",
    NegativePrompt: "否定提示",
    PleaseInput: (name: string) => `请输入${name}`,
    AspectRatio: "横纵比",
    ImageSize: "图片尺寸",
    ImageQuality: "图片质量",
    ImageStyle: "图像风格",
    OutFormat: "输出格式",
    AIModel: "AI模型",
    ModelVersion: "模型版本",
    Submit: "提交生成",
    ParamIsRequired: (name: string) => `${name}不能为空`,
    Styles: {
      D3Model: "3D模型",
      AnalogFilm: "模拟电影",
      Anime: "动漫",
      Cinematic: "电影风格",
      ComicBook: "漫画书",
      DigitalArt: "数字艺术",
      Enhance: "增强",
      FantasyArt: "幻想艺术",
      Isometric: "等角",
      LineArt: "线描",
      LowPoly: "低多边形",
      ModelingCompound: "建模材料",
      NeonPunk: "霓虹朋克",
      Origami: "折纸",
      Photographic: "摄影",
      PixelArt: "像素艺术",
      TileTexture: "贴图",
    },
    Modes: {
      Generation: "生成",
      Editing: "编辑",
    },
    SourceTypes: {
      History: "历史图片",
      Upload: "本地上传",
    },
  },
  Sd: {
    Title: "AI 绘图",
    SubTitle: (count: number) => `共 ${count} 条绘画`,
    NoModelsText: "当前没有可用的图片模型，",
    NoModelsAction: "购买",
    EndpointLabel: "端点",
    SourceLabel: "来源",
    Actions: {
      Params: "查看参数",
      Copy: "复制提示词",
      Delete: "删除",
      Retry: "重试",
      EditAgain: "继续编辑",
      ReturnHome: "返回首页",
      History: "查看历史",
    },
    EmptyRecord: "暂无绘画记录",
    Status: {
      Name: "状态",
      Success: "成功",
      Error: "失败",
      Wait: "等待中",
      Running: "运行中",
    },
    Danger: {
      Delete: "确认删除？",
    },
    GenerateParams: "生成参数",
    Detail: "详情",
    Errors: {
      MissingToken: "当前未提供 Router 访问令牌，请先登录后再试。",
      Unauthorized: "当前没有访问该图片模型的权限，请检查登录态和分组配置。",
    },
    SelectImageFirst: "请先选择一张要编辑的图片。",
  },
  Storage: {
    Title: "云端存储",
    SubTitle: "管理应用数据同步、空间配额与存储配置",
    StatusReady: "存储可用",
    StatusNeedsConfig: "需要配置",
    StatusChecking: "检查中",
    StatusError: "存储异常",
    StatusDesc:
      "当前阶段用于聊天、技能、提示词和本地缓存的云端同步；后续可扩展为模型可访问的工具文件能力。",
    Check: "检查连接",
    CheckSuccess: "存储连接正常",
    CheckFail: "存储连接失败",
    SyncNow: "立即同步",
    ConfigTitle: "存储配置",
    QuotaTotal: "总配额",
    QuotaUsed: "已使用",
    QuotaAvailable: "剩余空间",
    DataTitle: "数据管理",
    WorkspaceAccount: "当前工作区账号",
    WorkspaceAccountGuest: "未登录（访客工作区）",
    WorkspaceSyncDelay: (seconds: number) =>
      `账号工作区刚切换，自动同步已暂缓约 ${seconds} 秒，避免误覆盖远端数据。`,
    LastSync: "最近同步",
    LocalData: "本地数据",
    Expansion: "存储扩容",
    ExpansionDesc: "提升云端存储空间上限",
    Expand: "立即扩容",
  },
};

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type LocaleType = typeof cn;
export type PartialLocaleType = DeepPartial<typeof cn>;

export default cn;

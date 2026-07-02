import { getClientConfig } from "../config/client";
import type { LocaleType } from "./index";
// if you are adding a new translation, please use PartialLocaleType instead of LocaleType

const ENTER_KEY = "Enter";

const isApp = !!getClientConfig()?.isApp;
const en: LocaleType = {
  WIP: "Coming Soon...",
  Error: {
    Mermaid: "Mermaid syntax error. Source code is preserved.",
    Unauthorized: isApp
      ? `😆 Oops, there's an issue. No worries:
     \\ 1️⃣ Want zero-config access? Please use Chat AI
     \\ 2️⃣ Want to use your own OpenAI resources? [Click here](/#/settings) to change settings ⚙️`
      : `😆 Oops, there's an issue. Let's fix it:
     \ 1️⃣ Want zero-config access? Please use Chat AI
     \ 2️⃣ Need to finish account authorization? [Click here](/#/auth) to sign in 🔑
     \ 3️⃣ Want to use your own OpenAI resources? [Click here](/#/settings) to change settings ⚙️
     `,
  },
  Auth: {
    Return: "Return",
    Title: "Sign In",
    Tips: "Authorize with your blockchain address",
    SubTips: "Use wallet signature or centralized UCAN authorization",
    Input: "Enter or select blockchain address",
    Confirm: "Sign In",
    Later: "Later",
    Processing: "Processing...",
    EmptyHistory: "No recent addresses",
    ClearSelection: "Clear current selection",
    ExpandAccountList: "Expand address list",
    MissingAccount: "Enter or select a blockchain address first",
    MissingWalletAccount: "No wallet account found",
    LoginCancelled: "Sign-in cancelled",
    SwitchToAppAccount:
      "Switch to the app address in your wallet, then sign in again",
    WalletLoginFailed: (error: string) => `Wallet sign-in failed: ${error}`,
    MissingRouterAudience:
      "Cannot resolve Router audience. Check ROUTER_BACKEND_URL",
    CentralLoginSuccess: "Centralized UCAN sign-in succeeded",
    CentralExchangeFailed: (error: string) =>
      `Failed to exchange centralized authorization code: ${error}`,
    CentralRequestCreated:
      "Centralized authorization request created. Redirecting...",
    CentralRequestFailed: (error: string) =>
      `Failed to create centralized authorization request: ${error}`,
    WalletMismatch: {
      Title: "Account mismatch",
      Description:
        "The app address and wallet address do not match. Choose how to sign in.",
      App: "App",
      Wallet: "Wallet",
      Switch: "Switch in wallet",
      UseWallet: "Use wallet address",
    },
    TopTips:
      "🥳 Chat AI launch promotion: Instantly unlock the latest models like qwen3.7-plus, deepseek-v4-pro, gpt-5.5, claude-4.8!",
  },
  ChatItem: {
    ChatItemCount: (count: number) => `${count} messages`,
  },
  Chat: {
    SubTitle: (count: number) => `${count} messages`,
    EditMessage: {
      Title: "Edit All Messages",
      Topic: {
        Title: "Topic",
        SubTitle: "Change the current topic",
      },
    },
    Actions: {
      ChatList: "View Chat List",
      CompressedHistory: "Compressed History Memory Prompt",
      Export: "Export All Messages as Markdown",
      Copy: "Copy",
      Stop: "Stop",
      Retry: "Retry",
      Pin: "Pin",
      PinToastContent: "Pinned 1 messages to contextual prompts",
      PinToastAction: "View",
      Delete: "Delete",
      Edit: "Edit",
      FullScreen: "FullScreen",
      RefreshTitle: "Refresh Title",
      RefreshToast: "Title refresh request sent",
      Speech: "Play",
      StopSpeech: "Stop",
    },
    Commands: {
      new: "Start a new chat",
      newm: "Start with a skill",
      next: "Next Chat",
      prev: "Previous Chat",
      clear: "Clear Context",
      fork: "Copy Chat",
      del: "Delete Chat",
    },
    InputActions: {
      Stop: "Stop",
      ToBottom: "To Latest",
      Theme: {
        auto: "Auto",
        light: "Light Theme",
        dark: "Dark Theme",
      },
      Prompt: "Prompts",
      Masks: "Skills",
      Clear: "Clear Context",
      Settings: "Settings",
      UploadImage: "Upload Images",
    },
    Rename: "Rename Chat",
    Typing: "Typing…",
    Input: (submitKey: string) => {
      var inputHints = `${submitKey} to send`;
      if (submitKey === ENTER_KEY) {
        inputHints += ", Shift + Enter to wrap";
      }
      return inputHints + ", / to search prompts, : to use commands";
    },
    Send: "Send",
    StartSpeak: "Start Speak",
    StopSpeak: "Stop Speak",
    Config: {
      Reset: "Reset to Default",
    },
    IsContext: "Contextual Prompt",
    ShortcutKey: {
      Title: "Keyboard Shortcuts",
      newChat: "Open New Chat",
      focusInput: "Focus Input Field",
      copyLastMessage: "Copy Last Reply",
      copyLastCode: "Copy Last Code Block",
      showShortcutKey: "Show Shortcuts",
      clearContext: "Clear Context",
    },
    RouterPrompt: {
      Action: "Open Router",
      MissingToken:
        "There is no available token yet. Go to Router to choose or top up a token before starting the conversation.",
      DisabledToken:
        "The current token has been disabled. Go to Router and choose another available token.",
      ExpiredToken:
        "The current token has expired. Go to Router to switch or top up before continuing.",
      DepletedToken:
        "The current token has insufficient balance. Go to Router to top it up before continuing.",
      NoTextModels:
        "The current token did not return any available text models. Go to Router to check balance, model access, or choose another token.",
      NoSkillModels:
        "This skill does not currently match any available model. Go to Router to check the skill's candidate models and token coverage.",
      DefaultModelUnavailable:
        "The skill's default model is currently unavailable. Switch to a model supported by the current token, or adjust token settings in Router.",
    },
  },
  Export: {
    Title: "Export Messages",
    Copy: "Copy All",
    Download: "Download",
    MessageFromYou: "Message From You",
    MessageFromChatGPT: "Message From ChatGPT",
    Share: "Share to ShareGPT",
    Format: {
      Title: "Export Format",
      SubTitle: "Markdown or PNG Image",
    },
    IncludeContext: {
      Title: "Including Context",
      SubTitle: "Export skill context prompts or not",
    },
    Steps: {
      Select: "Select",
      Preview: "Preview",
    },
    Image: {
      Toast: "Capturing Image...",
      Modal: "View Image",
    },
    Artifacts: {
      Title: "Share Artifacts",
      Error: "Share Error",
    },
  },
  Select: {
    Search: "Search",
    All: "Select All",
    Latest: "Select Latest",
    Clear: "Clear",
  },
  Memory: {
    Title: "Memory Prompt",
    EmptyContent: "Nothing yet.",
    Send: "Send Memory",
    Copy: "Copy Memory",
    Reset: "Reset Session",
    ResetConfirm:
      "Resetting will clear the current conversation history and historical memory. Are you sure you want to reset?",
  },
  Home: {
    NewChat: "Session",
    DeleteChat: "Confirm to delete the selected conversation?",
    DeleteToast: "Chat Deleted",
    Revert: "Revert",
  },
  OWNER_CENTER: {
    MyPage: "person center",
  },
  Settings: {
    Title: "Settings",
    SubTitle: "All Settings",
    ShowPassword: "ShowPassword",
    Account: {
      Address: {
        Title: "Blockchain Address",
      },
      Logout: {
        Title: "Sign out",
        SubTitle:
          "Disconnect the current wallet account and clear the local authorization session.",
        Action: "Sign out",
      },
    },
    Danger: {
      Reset: {
        Title: "Reset All Settings",
        SubTitle: "Reset all setting items to default",
        Action: "Reset",
        Confirm: "Confirm to reset all settings to default?",
      },
      Clear: {
        Title: "Clear All Data",
        SubTitle: "Clear all messages and settings",
        Action: "Clear",
        Confirm: "Confirm to clear all messages and settings?",
      },
    },
    Lang: {
      Name: "Language", // ATTENTION: if you wanna add a new translation, please do not translate this value, leave it as `Language`
      All: "All Languages",
    },
    Avatar: "Avatar",
    FontSize: {
      Title: "Font Size",
      SubTitle: "Adjust font size of chat content",
    },
    FontFamily: {
      Title: "Chat Font Family",
      SubTitle:
        "Font Family of the chat content, leave empty to apply global default font",
      Placeholder: "Font Family Name",
    },
    InjectSystemPrompts: {
      Title: "Inject System Prompts",
      SubTitle: "Inject a global system prompt for every request",
    },
    InputTemplate: {
      Title: "Input Template",
      SubTitle: "Newest message will be filled to this template",
    },

    Update: {
      Version: (x: string) => `Version: ${x}`,
      IsLatest: "Latest version",
      CheckUpdate: "Check Update",
      IsChecking: "Checking update...",
      FoundUpdate: (x: string) => `Found new version: ${x}`,
      GoToUpdate: "Update",
      Success: "Update Successful.",
      Failed: "Update Failed.",
    },
    SendKey: "Send Key",
    Theme: "Theme",
    TightBorder: "Tight Border",
    SendPreviewBubble: {
      Title: "Send Preview Bubble",
      SubTitle: "Preview markdown in bubble",
    },
    AutoGenerateTitle: {
      Title: "Auto Generate Title",
      SubTitle: "Generate a suitable title based on the conversation content",
    },
    Sync: {
      NotSyncYet: "Not sync yet",
      Success: "Sync Success",
      Fail: "Sync Fail",

      Config: {
        SyncType: {
          Title: "Sync Type",
          SubTitle: "Choose your favorite sync service",
        },
        AutoSync: {
          Title: "Auto Sync",
        },
        AutoSyncInterval: {
          Title: "Auto Sync Interval (min)",
        },
        Proxy: {
          Title: "Enable CORS Proxy",
          SubTitle: "Enable a proxy to avoid cross-origin restrictions",
        },
        ProxyUrl: {
          Title: "Proxy Endpoint",
          SubTitle:
            "Only applicable to the built-in CORS proxy for this project",
        },

        WebDav: {
          Endpoint: "WebDAV Endpoint",
          BaseUrl: "WebDAV Base URL",
          BaseUrlSubTitle: "No path included, e.g. https://webdav.example.com",
          Prefix: "WebDAV Prefix",
          PrefixSubTitle: "Default /dav, optional to change",
          UcanBaseUrl: "WebDAV Backend Base URL",
          UcanPrefix: "WebDAV Backend Prefix",
          AuthType: "WebDAV Auth",
          UserName: "User Name",
          Password: "Password",
        },

        UpStash: {
          Endpoint: "UpStash Redis REST URL",
          UserName: "Backup Name",
          Password: "UpStash Redis REST Token",
        },
      },

      Overview: (overview: any) => {
        const skillCount = overview.skill ?? overview.mask ?? 0;
        return `${overview.chat} chats，${overview.message} messages，${overview.prompt} prompts，${skillCount} skills`;
      },
      ImportFailed: "Failed to import from file",
    },
    Mask: {
      Splash: {
        Title: "Skill Picker",
        SubTitle: "Show the skill picker before starting a new chat",
      },
      Builtin: {
        Title: "Hide Builtin Skills",
        SubTitle: "Hide builtin skills in the skill list",
      },
    },
    Prompt: {
      Disable: {
        Title: "Disable quick phrase auto-completion",
        SubTitle: "Input / to trigger user-defined quick phrases",
      },
      List: "Quick Phrase List",
      ListCount: (builtin: number, custom: number) =>
        `${builtin} legacy built-in, ${custom} user-defined`,
      Edit: "Edit",
      Modal: {
        Title: "Quick Phrase List",
        Add: "Add One",
        Search: "Search quick phrases",
      },
      EditModal: {
        Title: "Edit Quick Phrase",
      },
    },
    HistoryCount: {
      Title: "Attached Messages Count",
      SubTitle: "Number of sent messages attached per request",
    },
    CompressThreshold: {
      Title: "History Compression Threshold",
      SubTitle:
        "Will compress if uncompressed messages length exceeds the value",
    },

    Usage: {
      Title: "Account Balance",
      SubTitle(used: any, total: any) {
        return `Used this month $${used}, subscription $${total}`;
      },
      IsChecking: "Checking...",
      Check: "Check",
      NoAccess: "Select a token or enter an API key to view balance",
    },
    Access: {
      SaasStart: {
        Title: "Use Chat AI",
        Label: " (Most Cost-Effective Option)",
        SubTitle:
          "Maintained by Chat, zero setup needed, unlock OpenAI o1, GPT-4o," +
          " Claude-3.5 and more",
        ChatNow: "Start Now",
      },
      AccessCode: {
        Title: "Access Code",
        SubTitle: "Access control Enabled",
        Placeholder: "Enter Code",
      },
      CustomEndpoint: {
        Title: "Custom Endpoint",
        SubTitle: "Use custom Azure or OpenAI service",
      },
      Provider: {
        Title: "Model Provider",
        SubTitle: "Select Azure or OpenAI",
      },
      OpenAI: {
        ApiKey: {
          Title: "OpenAI API Key",
          SubTitle: "User custom OpenAI Api Key",
          Placeholder: "sk-xxx",
        },

        Endpoint: {
          Title: "OpenAI Endpoint",
          SubTitle: "Must start with http(s):// or use /api/openai as default",
        },
      },
      Azure: {
        ApiKey: {
          Title: "Azure Api Key",
          SubTitle: "Check your api key from Azure console",
          Placeholder: "Azure Api Key",
        },

        Endpoint: {
          Title: "Azure Endpoint",
          SubTitle: "Example: ",
        },

        ApiVerion: {
          Title: "Azure Api Version",
          SubTitle: "Check your api version from azure console",
        },
      },
      Anthropic: {
        ApiKey: {
          Title: "Anthropic API Key",
          SubTitle:
            "Use a custom Anthropic Key to bypass password access restrictions",
          Placeholder: "Anthropic API Key",
        },

        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },

        ApiVerion: {
          Title: "API Version (claude api version)",
          SubTitle: "Select and input a specific API version",
        },
      },
      Baidu: {
        ApiKey: {
          Title: "Baidu API Key",
          SubTitle: "Use a custom Baidu API Key",
          Placeholder: "Baidu API Key",
        },
        SecretKey: {
          Title: "Baidu Secret Key",
          SubTitle: "Use a custom Baidu Secret Key",
          Placeholder: "Baidu Secret Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "not supported, configure in .env",
        },
      },
      Tencent: {
        ApiKey: {
          Title: "Tencent API Key",
          SubTitle: "Use a custom Tencent API Key",
          Placeholder: "Tencent API Key",
        },
        SecretKey: {
          Title: "Tencent Secret Key",
          SubTitle: "Use a custom Tencent Secret Key",
          Placeholder: "Tencent Secret Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "not supported, configure in .env",
        },
      },
      Volcengine: {
        ApiKey: {
          Title: "volcengine API Key",
          SubTitle: "Use a custom volcengine API Key",
          Placeholder: "volcengine API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      Alibaba: {
        ApiKey: {
          Title: "Alibaba API Key",
          SubTitle: "Use a custom Alibaba Cloud API Key",
          Placeholder: "Alibaba Cloud API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      Moonshot: {
        ApiKey: {
          Title: "Moonshot API Key",
          SubTitle: "Use a custom Moonshot API Key",
          Placeholder: "Moonshot API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      DeepSeek: {
        ApiKey: {
          Title: "DeepSeek API Key",
          SubTitle: "Use a custom DeepSeek API Key",
          Placeholder: "DeepSeek API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      XAI: {
        ApiKey: {
          Title: "XAI API Key",
          SubTitle: "Use a custom XAI API Key",
          Placeholder: "XAI API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      ChatGLM: {
        ApiKey: {
          Title: "ChatGLM API Key",
          SubTitle: "Use a custom ChatGLM API Key",
          Placeholder: "ChatGLM API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      SiliconFlow: {
        ApiKey: {
          Title: "SiliconFlow API Key",
          SubTitle: "Use a custom SiliconFlow API Key",
          Placeholder: "SiliconFlow API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      Stability: {
        ApiKey: {
          Title: "Stability API Key",
          SubTitle: "Use a custom Stability API Key",
          Placeholder: "Stability API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      Iflytek: {
        ApiKey: {
          Title: "Iflytek API Key",
          SubTitle: "Use a Iflytek API Key",
          Placeholder: "Iflytek API Key",
        },
        ApiSecret: {
          Title: "Iflytek API Secret",
          SubTitle: "Use a Iflytek API Secret",
          Placeholder: "Iflytek API Secret",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
      CustomModel: {
        Title: "Custom Models",
        SubTitle: "Custom model options, seperated by comma",
      },
      Google: {
        ApiKey: {
          Title: "API Key",
          SubTitle: "Obtain your API Key from Google AI",
          Placeholder: "Google AI API Key",
        },

        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },

        ApiVersion: {
          Title: "API Version (specific to gemini-pro)",
          SubTitle: "Select a specific API version",
        },
        GoogleSafetySettings: {
          Title: "Google Safety Settings",
          SubTitle: "Select a safety filtering level",
        },
      },
      AI302: {
        ApiKey: {
          Title: "302.AI API Key",
          SubTitle: "Use a custom 302.AI API Key",
          Placeholder: "302.AI API Key",
        },
        Endpoint: {
          Title: "Endpoint Address",
          SubTitle: "Example: ",
        },
      },
    },

    Model: "Model",
    CompressModel: {
      Title: "Summary Model",
      SubTitle: "Model used to compress history and generate title",
      Auto: "Auto",
    },
    Temperature: {
      Title: "Temperature",
      SubTitle: "A larger value makes the more random output",
    },
    TopP: {
      Title: "Top P",
      SubTitle: "Do not alter this value together with temperature",
    },
    MaxTokens: {
      Title: "Max Tokens",
      SubTitle: "Maximum length of input tokens and generated tokens",
    },
    PresencePenalty: {
      Title: "Presence Penalty",
      SubTitle:
        "A larger value increases the likelihood to talk about new topics",
    },
    FrequencyPenalty: {
      Title: "Frequency Penalty",
      SubTitle:
        "A larger value decreasing the likelihood to repeat the same line",
    },
    TTS: {
      Enable: {
        Title: "Enable TTS",
        SubTitle: "Enable text-to-speech service",
      },
      Autoplay: {
        Title: "Enable Autoplay",
        SubTitle:
          "Automatically generate speech and play, you need to enable the text-to-speech switch first",
      },
      Model: "Model",
      Voice: {
        Title: "Voice",
        SubTitle: "The voice to use when generating the audio",
      },
      Speed: {
        Title: "Speed",
        SubTitle: "The speed of the generated audio",
      },
      Engine: "TTS Engine",
    },
    Realtime: {
      Enable: {
        Title: "Realtime Chat",
        SubTitle: "Enable realtime chat feature",
      },
      Provider: {
        Title: "Model Provider",
        SubTitle: "Switch between different providers",
      },
      Model: {
        Title: "Model",
        SubTitle: "Select a model",
      },
      ApiKey: {
        Title: "API Key",
        SubTitle: "API Key",
        Placeholder: "API Key",
      },
      Router: {
        Endpoint: {
          Title: "Router Endpoint",
          SubTitle: "Leave empty to use the Router page or runtime endpoint",
          Placeholder: "https://llm.yeying.pub",
        },
        Token: {
          Title: "Router Token",
          SubTitle: "Leave empty to use the token selected on the Router page",
          Placeholder: "Router token, optional",
        },
      },
      Azure: {
        Endpoint: {
          Title: "Endpoint",
          SubTitle: "Endpoint",
        },
        Deployment: {
          Title: "Deployment Name",
          SubTitle: "Deployment Name",
        },
      },
      Temperature: {
        Title: "Randomness (temperature)",
        SubTitle: "Higher values result in more random responses",
      },
    },
  },
  Store: {
    DefaultTopic: "Direct Chat",
    BotHello: "Hello! How can I assist you today?",
    Error: "Something went wrong, please try again later.",
    Prompt: {
      History: (content: string) =>
        "This is a summary of the chat history as a recap: " + content,
      Topic:
        "Please generate a four to five word title summarizing our conversation without any lead-in, punctuation, quotation marks, periods, symbols, bold text, or additional text. Remove enclosing quotation marks.",
      Summarize:
        "Summarize the discussion briefly in 200 words or less to use as a prompt for future context.",
    },
  },
  Copy: {
    Success: "Copied to clipboard",
    Failed: "Copy failed, please grant permission to access clipboard",
  },
  Download: {
    Success: "Content downloaded to your directory.",
    Failed: "Download failed.",
  },
  Context: {
    Toast: (x: any) => `With ${x} contextual prompts`,
    Edit: "Current Chat Settings",
    Add: "Add a Prompt",
    Clear: "Context Cleared",
    Revert: "Revert",
  },
  Discovery: {
    Name: "Discovery",
    Page: {
      Title: "Discovery",
      SubTitle:
        "Skills are used or configured; tools can be installed, configured, and managed",
    },
    Types: {
      all: "All",
      skill: "Skills",
      tool: "Tools",
      provider: "Model Services",
      storage: "Storage",
    },
    Status: {
      Enabled: "Enabled",
      Available: "Available",
      Installed: "Installed",
      Configurable: "Configurable",
      Unavailable: "Unavailable",
      Paused: "Paused",
      Error: "Error",
    },
    Pricing: {
      free: "Free",
      subscription: "Subscription",
      usage: "Usage-based",
    },
    Runtime: {
      cloud: "Cloud",
      local: "Local",
      both: "Cloud / Local",
    },
    Source: {
      Official: "Official",
      Community: "Community",
      Custom: "Custom",
      Provider: "Model Service",
    },
    SourceLabel: "Source",
    ToolStatus: "Tool Status",
    ConfigMode: "Config mode",
    ToolUserProvided: "User-provided tool config",
    ToolUserConfigHint:
      "Tools support both cloud and native runtimes. Web users typically use cloud-hosted tools out of the box; desktop or self-hosted environments can install, configure, and manage tools locally. This panel writes local tool runtime config, so only use it in a trusted environment.",
    OpenToolManager: "Open Tool Manager",
    Manage: "Manage",
    Configure: "Configure",
    Enable: "Enable",
    ConfigureAndEnable: "Configure & Enable",
    Install: "Install",
    Use: "Start",
    MyCapabilities: "My Capabilities",
    BackToMarket: "Back to Market",
    SearchMarket: "Search skills, tools, models, and storage",
    SearchMine: "Search my capabilities",
    Empty: "No matching capabilities",
    ResetFilters: "Clear filters",
    DefaultSkillDesc:
      "A task-oriented workflow that can bind models, prompts, and tools. Skills themselves do not need installation.",
    SkillStarters: (count: number) => `${count} starters`,
    SkillTools: (count: number) => `${count} bound tools`,
    RouterProviderTitle: "Community Router",
    RouterProviderDesc:
      "Default model service for accessing community-available models.",
    CloudStorageTitle: "Cloud Storage",
    CloudStorageDesc:
      "Manage cloud sync and quota usage for chats, skills, and local app data.",
    StorageAppSync: "App sync",
    NoImageModels: "No image models available",
    StorageQuotaUsage: (used: string, quota: string) =>
      `${used} / ${quota} used`,
    StorageQuotaUnlimited: (used: string) => `${used} used / unlimited`,
    ProviderDesc: (available: number, total: number, tags: string[]) =>
      tags.length > 0
        ? `${available}/${total} models available · ${tags.join(" / ")}`
        : `${available}/${total} models available`,
    ToolTitle: "Tools",
    ToolDesc:
      "Connect tool capabilities such as search, fetch, filesystem, git, and time. Tools can be cloud-hosted or locally installed and configured.",
  },
  Tool: {
    Name: "Tools",
  },
  FineTuned: {
    Sysmessage: "You are an assistant that",
  },
  SearchChat: {
    Name: "Search",
    Page: {
      Title: "Search Chat History",
      Search: "Enter search query to search chat history",
      NoResult: "No results found",
      NoData: "No data",
      Loading: "Loading...",

      SubTitle: (count: number) => `Found ${count} results`,
    },
    Item: {
      View: "View",
    },
  },
  Plugin: {
    Name: "OpenAPI Import",
    Page: {
      Title: "OpenAPI Import",
      SubTitle: (count: number) => `${count} OpenAPI interfaces`,
      Search: "Search OpenAPI interfaces",
      Create: "Create",
      Find: "Import HTTP APIs from OpenAPI schemas. They can be adapted into tools later: ",
    },
    Item: {
      Info: (count: number) => `${count} method`,
      View: "View",
      Edit: "Edit",
      Delete: "Delete",
      DeleteConfirm: "Confirm to delete?",
    },
    Auth: {
      None: "None",
      Basic: "Basic",
      Bearer: "Bearer",
      Custom: "Custom",
      CustomHeader: "Parameter Name",
      Token: "Token",
      Proxy: "Using Proxy",
      ProxyDescription: "Using proxies to solve CORS error",
      Location: "Location",
      LocationHeader: "Header",
      LocationQuery: "Query",
      LocationBody: "Body",
    },
    EditModal: {
      Title: (readonly: boolean) =>
        `Edit OpenAPI Import ${readonly ? "(readonly)" : ""}`,
      Download: "Download",
      Auth: "Authentication Type",
      Content: "OpenAPI Schema",
      Load: "Load From URL",
      Method: "Method",
      Error: "OpenAPI Schema Error",
    },
  },
  Wallet: {
    CollectWallet: "collect wallet",
  },
  Skill: {
    Name: "Skills",
    Package: {
      Title: "Skill Package Configuration",
      Labels: {
        runtime: "Runtime",
        model: "Model",
        permissions: "Permissions",
        tools: "Tools",
        visibility: "Visibility",
        version: "Version",
        chat: "Session",
        sd: "Image Creation",
        external: "External",
        globalModel: "Use global model",
        none: "None",
        noExtraPermissions: "No extra permissions",
        public: "Public",
        organization: "Organization",
        private: "Private",
      },
    },
    Page: {
      Title: "Skills",
      SubTitle: (count: number) => `${count} skills`,
      Search: "Search Skills",
      Create: "Create Local Skill",
      AllCategories: "All",
      Empty: "No matching skills",
      BuiltinSection: "Built-in Skills",
      BuiltinSectionDesc:
        "Official skills available out of the box. Copy them as local skills before changing configuration.",
      LocalSection: "Local Skills",
      LocalSectionDesc:
        "Skill configs created, imported, or copied in this local instance.",
      BuiltinEmpty: "No matching built-in skills",
      LocalEmpty: "No matching local skills",
    },
    Item: {
      Info: (count: number) => `${count} prompts`,
      Chat: "Chat",
      View: "View",
      Edit: "Edit",
      Delete: "Delete",
      DeleteConfirm: "Confirm to delete?",
    },
    EditModal: {
      Title: (readonly: boolean) =>
        `Edit Skill ${readonly ? "(readonly)" : ""}`,
      Download: "Download Skill",
      Clone: "Copy as Local Skill",
    },
    Config: {
      Avatar: "Bot Avatar",
      Name: "Bot Name",
      CandidateModels: {
        Title: "Candidate Models",
        SubTitle:
          "Chat sessions created from this skill can only use these models",
        SummaryNone: "No restriction",
        SummarySelected: (count: number) => `${count} models selected`,
      },
      Tools: {
        SummaryNone: "None selected",
        SummarySelected: (count: number) => `${count} selected`,
        BuiltIn: {
          Title: "Built-in Tools",
          SubTitle: "Model platform capabilities such as Web Search",
        },
        ToolServers: {
          Title: "Tools",
          SubTitle:
            "Restrict which tool services this skill can call; none selected means unrestricted",
        },
        NativeToolBridge: {
          Title: "Tool Strategy",
          SubTitle:
            "Used by skills such as Deep Reasoning; enabled allows Brave/fetch and other connected tools, disabled uses only the model itself",
        },
      },
      Sync: {
        Title: "Use Global Config",
        SubTitle: "Use global config in this chat",
        Confirm: "Confirm to override custom config with global config?",
      },
      HideContext: {
        Title: "Hide Context Prompts",
        SubTitle: "Do not show in-context prompts in chat",
      },
      Artifacts: {
        Title: "Enable Artifacts",
        SubTitle: "Can render HTML page when enable artifacts.",
      },
      CodeFold: {
        Title: "Enable CodeFold",
        SubTitle:
          "Automatically collapse/expand overly long code blocks when CodeFold is enabled",
      },
      Share: {
        Title: "Share This Skill",
        SubTitle: "Generate a link to this skill",
        Action: "Copy Link",
      },
    },
  },
  NewChat: {
    Return: "Return",
    Skip: "Just Start",
    Title: "New Chat",
    SubTitle: "Start blank, or choose a skill for the current task",
    Placeholder: "Type an idea to start a session",
    BlankTitle: "Chat",
    BlankSubTitle: "Start without a preset skill.",
    ImageTitle: "Image Creation",
    RecentTitle: "Recent",
    FeaturedTitle: "Skills",
    FeaturedSubTitle: "Skills apply task-specific prompts and model settings.",
    More: "All",
    EmptySkills: "No available skills",
    ExploreSkills: "Discover",
    ModelPlaceholder: "Choose a model",
    NotShow: "Never Show Again",
    ConfirmNoShow: "Confirm to disable？You can enable it in settings later.",
    Router: {
      SetupTitle: "Set up an available token before starting",
      NoModelTitle: "No text models are currently available",
      SetupDesc:
        "Go to Router to select or top up a token, then return to Chat to start immediately.",
      DisabledDesc:
        "The current token has been disabled. Go to Router and choose another available token.",
      ExpiredDesc:
        "The current token has expired. Go to Router to switch or top up before continuing.",
      DepletedDesc:
        "The current token has insufficient balance. Go to Router to top it up before continuing.",
      NoModelDesc:
        "The current token did not return any available text models. Go to Router to check balance, model access, or choose another token.",
      OpenRouter: "Open Router",
    },
  },
  Setup: {
    Title: "Model Setup",
    SubTitle:
      "This workspace is not ready for chatting yet. Finish Router or model access setup first.",
    Purchase: "Buy",
    OpenCommunityRouter: "Set Up Router",
  },

  Router: {
    RefreshModels: "Refresh Models",
    ReturnToChat: "Go to Chat",
    ReturnToNewChat: "Go to New Session",
    Banner: {
      SelectTitle: "Choose an available token first",
      SelectDesc:
        "After choosing a token, Chat will immediately use it to load text, image, and realtime voice models.",
      SelectPrimary: "Open Token Center",
      SelectSecondary: "Return to Chat",
      RechargeTitle: "The current token has insufficient balance",
      RechargeDesc:
        "Go to the Router portal to top up or switch tokens, then return to Chat to continue.",
      RechargePrimary: "Top Up",
      RechargeSecondary: "Check Again",
      RenewTitle: "The current token has expired",
      RenewDesc:
        "Renew or switch to a new available token in the Router portal, then return to Chat to continue.",
      RenewPrimary: "Open Portal",
      RenewSecondary: "Check Again",
      DisabledTitle: "The current token is unavailable",
      DisabledDesc:
        "This token has been disabled or is no longer valid. Choose another available token before returning to Chat.",
      DisabledPrimary: "Choose Another Token",
      DisabledSecondary: "Return to Chat",
      TokenTitle: "Finish Router setup to get started",
      TokenDesc:
        "Choose an available token first. If models or quota changed just now, you can run a fresh check.",
      TokenPrimary: "Check Again",
      TokenSecondary: "Return to Chat",
    },
    Status: {
      Title: "Router Status",
      SubTitle: "Current token status and account usage.",
      TokenReady: "Model Token Selected",
      TokenMissing: "Model Token Missing",
      UsageReady: "Usage Check Ready",
      UsagePending: "Usage Check Not Ready",
      Checking: "Checking",
      TokenName: "Current Token",
      AvailableQuota: "Available Balance",
      UsedQuota: "Used",
      ExpiresAt: "Expires At",
      NotSelected: "Not Selected",
      Unlimited: "Unlimited",
      Unavailable: "Unavailable",
      NotSet: "Not Set",
    },
    Config: {
      Title: "Router Config",
      SubTitle: "Endpoint and default model token.",
      Endpoint: "Endpoint URL",
      EndpointHint: (url: string) => `Default URL: ${url}`,
      Token: "Token",
      UnnamedToken: "Untitled",
      TokensLoading: "Loading tokens",
      NoTokens: "No available tokens found",
      TokenHint:
        "Text, image, voice, and model list requests will prefer the token selected here.",
    },
    Models: {
      Title: "Supported Models",
      SubTitle: "Models available for the current token.",
      SearchPlaceholder: "Search model name, provider, or endpoint",
      Filters: {
        all: "All",
        text: "Text",
        image: "Image",
        reasoning: "Reasoning",
      },
      Headers: {
        Model: "Model",
        Provider: "Provider",
        Capabilities: "Capabilities",
        Endpoints: "Endpoints",
      },
      Capabilities: {
        Text: "Text",
        Vision: "Vision",
        Image: "Image",
        Edit: "Edit",
        Reasoning: "Reasoning",
        General: "General",
      },
      EmptyEndpoint: "No endpoints declared",
      Loading: "Loading models",
      EmptyWithToken: "The current token did not return any available models",
      EmptyWithoutToken: "Choose a token to load models",
    },
  },

  UI: {
    Confirm: "Confirm",
    Cancel: "Cancel",
    Close: "Close",
    Create: "Create",
    Edit: "Edit",
    Export: "Export",
    Import: "Import",
    Sync: "Sync",
    Config: "Config",
  },
  Exporter: {
    Description: {
      Title: "Only messages after clearing the context will be displayed",
    },
    Model: "Model",
    Messages: "Messages",
    Topic: "Topic",
    Time: "Time",
  },
  URLCommand: {
    Code: "Detected authorization parameters in the URL. Continue?",
    Settings: "Detected settings from url, confirm to apply?",
  },
  SdPanel: {
    Mode: "Mode",
    SourceType: "Image Source",
    UploadImage: "Upload Image",
    MaskImage: "Upload Mask",
    MaskImageSubTitle:
      "Transparent areas will be regenerated, or open the painter to brush a mask directly.",
    DrawMask: "Paint Mask",
    ClearMask: "Clear Mask",
    SaveMask: "Save Mask",
    MaskOverlay: "Overlay",
    MaskInteractionMode: "Interaction",
    MaskZoom: "Zoom",
    ResetZoom: "Reset Zoom",
    MaskBrushMode: "Brush Mode",
    MaskBrushSize: "Brush Size",
    MaskSaved: "Saved",
    MaskUnsaved: "Unsaved",
    MaskShortcutHint:
      "Use the mouse wheel or trackpad scroll to move the view, hold Ctrl or Command while scrolling to zoom, and hold Space to pan temporarily.",
    MaskDrawSubTitle:
      "Brush over the regions to regenerate. Saving will create a transparent PNG mask.",
    ModelSelectorTitle: "Select Image Model",
    ModelSelectorSearch: "Search model or provider",
    ModelSelectorAction: "Change",
    SubmitSummaryGenerate:
      "Generate a new image with the current prompt and parameters.",
    SubmitSummaryReady:
      "Source image and mask are ready. Editing will focus on the masked area.",
    SubmitSummaryNoMask:
      "A source image is selected, but no mask is attached. Some models may edit the full image.",
    MaskCloseConfirm: "This mask has unsaved changes. Close anyway?",
    MaskInteractionModes: {
      Draw: "Draw",
      Pan: "Pan",
    },
    MaskOverlayModes: {
      Show: "Show Overlay",
      Hide: "Hide Overlay",
    },
    MaskBrushModes: {
      Erase: "Regenerate Area",
      Restore: "Restore Area",
    },
    Provider: "Provider",
    Prompt: "Prompt",
    NegativePrompt: "Negative Prompt",
    PleaseInput: (name: string) => `Please input ${name}`,
    AspectRatio: "Aspect Ratio",
    ImageSize: "Image Size",
    ImageQuality: "Image Quality",
    ImageStyle: "Image Style",
    OutFormat: "Output Format",
    AIModel: "AI Model",
    ModelVersion: "Model Version",
    Submit: "Submit",
    ParamIsRequired: (name: string) => `${name} is required`,
    Styles: {
      D3Model: "3d-model",
      AnalogFilm: "analog-film",
      Anime: "anime",
      Cinematic: "cinematic",
      ComicBook: "comic-book",
      DigitalArt: "digital-art",
      Enhance: "enhance",
      FantasyArt: "fantasy-art",
      Isometric: "isometric",
      LineArt: "line-art",
      LowPoly: "low-poly",
      ModelingCompound: "modeling-compound",
      NeonPunk: "neon-punk",
      Origami: "origami",
      Photographic: "photographic",
      PixelArt: "pixel-art",
      TileTexture: "tile-texture",
    },
    Modes: {
      Generation: "Generate",
      Editing: "Edit",
    },
    SourceTypes: {
      History: "History Images",
      Upload: "Local Upload",
    },
  },
  Sd: {
    Title: "AI Images",
    SubTitle: (count: number) => `${count} images`,
    NoModelsText: "No image models are currently available, ",
    NoModelsAction: "buy",
    EndpointLabel: "Endpoint",
    SourceLabel: "Source",
    Actions: {
      Params: "See Params",
      Copy: "Copy Prompt",
      Delete: "Delete",
      Retry: "Retry",
      EditAgain: "Continue Editing",
      ReturnHome: "Return Home",
      History: "History",
    },
    EmptyRecord: "No images yet",
    Status: {
      Name: "Status",
      Success: "Success",
      Error: "Error",
      Wait: "Waiting",
      Running: "Running",
    },
    Danger: {
      Delete: "Confirm to delete?",
    },
    GenerateParams: "Generate Params",
    Detail: "Detail",
    Errors: {
      MissingToken:
        "Router access token is missing. Sign in first and try again.",
      Unauthorized:
        "You do not have access to this image model. Check your login state and group configuration.",
    },
    SelectImageFirst: "Choose an image to edit first.",
  },
  Storage: {
    Title: "Cloud Storage",
    SubTitle: "Manage app data sync, quota, and storage configuration",
    StatusReady: "Storage ready",
    StatusNeedsConfig: "Configuration required",
    StatusChecking: "Checking",
    StatusError: "Storage error",
    StatusDesc:
      "This currently syncs chats, skills, prompts, and local cache data. Later it can become a tool-backed file capability for models.",
    Check: "Check connection",
    CheckSuccess: "Storage connection is healthy",
    CheckFail: "Storage connection failed",
    SyncNow: "Sync now",
    ConfigTitle: "Storage Configuration",
    QuotaTotal: "Total quota",
    QuotaUsed: "Used",
    QuotaAvailable: "Available",
    DataTitle: "Data Management",
    WorkspaceAccount: "Current Workspace Account",
    WorkspaceAccountGuest: "Not signed in (guest workspace)",
    WorkspaceSyncDelay: (seconds: number) =>
      `Workspace just switched accounts. Auto sync is paused for about ${seconds}s to avoid overwriting remote data.`,
    LastSync: "Last sync",
    LocalData: "Local data",
    Expansion: "Storage expansion",
    ExpansionDesc: "Increase the cloud storage quota",
    Expand: "Expand now",
  },
};

export default en;

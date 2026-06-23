import { type Lang } from "../locales";
import { resolveLocalizedText, type LocalizedText } from "../skills";

const CATEGORY_LABELS: Record<Lang, Record<string, string>> = {
  cn: {
    finance: "金融",
    research: "调研",
    productivity: "效率",
    development: "开发",
    writing: "写作",
    data: "数据",
    trading: "交易",
    utility: "工具",
    general: "通用",
    reference: "参考",
  },
  en: {
    基础: "Basic",
    金融: "Finance",
    调研: "Research",
    效率: "Productivity",
    开发: "Development",
    写作: "Writing",
    数据: "Data",
    交易: "Trading",
    工具: "Utility",
    通用: "General",
    参考: "Reference",
  },
};

const TAG_LABELS: Record<Lang, Record<string, string>> = {
  cn: {
    official: "官方",
    community: "社区",
    search: "搜索",
    web: "网页",
    http: "HTTP",
    local: "本地",
    files: "文件",
    git: "Git",
    memory: "记忆",
    "knowledge-graph": "知识图谱",
    reasoning: "推理",
    tools: "工具",
    time: "时间",
    timezone: "时区",
    reference: "参考",
    testing: "测试",
    broker: "券商",
    paper: "模拟",
    simulation: "模拟",
    trading: "交易",
    "market-data": "行情数据",
    ifind: "iFinD",
    quantapi: "QuantAPI",
    tonghuashun: "同花顺",
    "live-trading": "实盘",
    "a-share": "A股",
    orders: "订单",
    portfolio: "组合",
    filesystem: "文件系统",
  },
  en: {
    官方: "Official",
    社区: "Community",
    搜索: "Search",
    网页: "Web",
    本地: "Local",
    文件: "Files",
    记忆: "Memory",
    推理: "Reasoning",
    工具: "Tools",
    时间: "Time",
    时区: "Timezone",
    参考: "Reference",
    测试: "Testing",
    券商: "Broker",
    模拟: "Paper",
    交易: "Trading",
    行情数据: "Market Data",
    同花顺: "TongHuaShun",
    实盘: "Live Trading",
    订单: "Orders",
    组合: "Portfolio",
  },
};

export function getMarketplaceText(
  value: string | LocalizedText | undefined,
  lang: Lang,
  fallback = "",
) {
  return resolveLocalizedText(value, lang, fallback);
}

export function getMarketplaceCategoryLabel(
  category: string | undefined,
  lang: Lang,
) {
  if (!category) return "";
  return CATEGORY_LABELS[lang][category] ?? category;
}

export function getMarketplaceTagLabel(tag: string, lang: Lang) {
  return TAG_LABELS[lang][tag] ?? tag;
}

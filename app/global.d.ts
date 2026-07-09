declare module "*.jpg";
declare module "*.png";
declare module "*.woff2";
declare module "*.woff";
declare module "*.ttf";
declare module "*.scss" {
  const content: Record<string, string>;
  export default content;
}

declare module "*.svg";

declare interface Window {
  _SW_ENABLED?: boolean;
}

declare type DangerConfig = {
  needCode: boolean;
  hideUserApiKey: boolean;
  hideBalanceQuery: boolean;
  disableFastLink: boolean;
  defaultModel: string;
  summarizeModel: string;
  visionModels: string;
};

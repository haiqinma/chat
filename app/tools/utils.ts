export function isToolJson(content: string) {
  return content.match(/```json:mcp:([^{\s]+)([\s\S]*?)```/);
}

export function extractToolJson(content: string) {
  const match = content.match(/```json:mcp:([^{\s]+)([\s\S]*?)```/);
  if (match && match.length === 3) {
    return { clientId: match[1], request: JSON.parse(match[2]) };
  }
  return null;
}

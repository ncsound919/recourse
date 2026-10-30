import prettier from 'prettier';

/**
 * Async formatting helper for generated tool source. Prettier v3 is async;
 * use this from routes/scripts where await is available. The sync composer
 * stays unformatted for template-synthesis compatibility.
 */
export async function formatToolSource(source: string): Promise<string> {
  try {
    return await prettier.format(source, { parser: 'typescript' });
  } catch {
    return source;
  }
}

export async function formatTestSource(source: string): Promise<string> {
  try {
    return await prettier.format(source, { parser: 'typescript' });
  } catch {
    return source;
  }
}

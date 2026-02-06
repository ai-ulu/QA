import { TestSnippet, ShareOptions } from './types';

export class CommunityLibrary {
  private snippets: Map<string, TestSnippet> = new Map();

  share(snippet: TestSnippet, options: ShareOptions): string {
    if (!options.public) {
      throw new Error('Only public snippets can be shared');
    }
    
    // Sanitize code before sharing
    const sanitized = this.sanitizeCode(snippet.code);
    const sharedSnippet = { ...snippet, code: sanitized };
    
    this.snippets.set(snippet.id, sharedSnippet);
    return `https://autoqa.dev/snippets/${snippet.id}`;
  }

  fork(snippetId: string, newAuthor: string): TestSnippet {
    const original = this.snippets.get(snippetId);
    if (!original) {
      throw new Error('Snippet not found');
    }

    const forked: TestSnippet = {
      ...original,
      id: `${snippetId}-fork-${Date.now()}`,
      author: newAuthor,
      forks: 0,
      upvotes: 0,
      downloads: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.snippets.set(forked.id, forked);
    
    // Increment fork count on original
    original.forks++;
    
    return forked;
  }

  search(query: string): TestSnippet[] {
    return Array.from(this.snippets.values()).filter(s =>
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );
  }

  private sanitizeCode(code: string): string {
    // Remove sensitive data patterns
    return code
      .replace(/password\s*=\s*['"][^'"]+['"]/gi, 'password = "[REDACTED]"')
      .replace(/api[_-]?key\s*=\s*['"][^'"]+['"]/gi, 'api_key = "[REDACTED]"')
      .replace(/token\s*=\s*['"][^'"]+['"]/gi, 'token = "[REDACTED]"');
  }
}

export interface TestSnippet {
  id: string;
  title: string;
  description: string;
  code: string;
  author: string;
  tags: string[];
  domain?: string;
  upvotes: number;
  downloads: number;
  forks: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShareOptions {
  public: boolean;
  allowForks: boolean;
  license: 'MIT' | 'Apache-2.0' | 'GPL-3.0' | 'Proprietary';
}

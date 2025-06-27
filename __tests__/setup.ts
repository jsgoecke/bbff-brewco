/**
 * Test setup file for BBFF & HMB Brewing Co. Photo Gallery tests
 */

import { vi } from 'vitest';

// Mock Cloudflare Workers environment
const mockEnv = {
  PHOTOS_BUCKET: {
    get: vi.fn(),
    put: vi.fn(),
    list: vi.fn(),
    head: vi.fn(),
  },
  BRANDING_ASSETS: {
    get: vi.fn(),
  },
  IMAGES: {
    input: vi.fn(),
  },
  ANALYTICS: {
    writeDataPoint: vi.fn(),
  },
  ENVIRONMENT: 'test',
  MAX_UPLOAD_SIZE: '10485760',
  UPLOAD_RATE_LIMIT: '100',
  CACHE_TTL: '300',
};

// Global test utilities
(global as any).mockEnv = mockEnv;

// Mock Request and Response for Cloudflare Workers
(global as any).Request = class MockRequest {
  constructor(public url: string, public init?: RequestInit) {}
  
  headers = new Map();
  method = 'GET';
  
  async formData() {
    return new FormData();
  }
  
  async json() {
    return {};
  }
};

(global as any).Response = class MockResponse {
  public status: number;
  public statusText: string;
  public headers: { get: (name: string) => string | null; set: (name: string, value: string) => void };
  public ok: boolean;
  
  constructor(public body?: any, public init?: ResponseInit) {
    this.status = init?.status || 200;
    this.statusText = init?.statusText || 'OK';
    this.ok = this.status >= 200 && this.status < 300;
    
    // Create headers object that behaves like Headers
    const headersMap = new Map<string, string>();
    
    if (init?.headers) {
      if (init.headers instanceof Map) {
        init.headers.forEach((value, key) => headersMap.set(key, value));
      } else if (typeof init.headers === 'object') {
        Object.entries(init.headers).forEach(([key, value]) => {
          if (typeof value === 'string') {
            headersMap.set(key, value);
          }
        });
      }
    }
    
    this.headers = {
      get: (name: string) => headersMap.get(name) || null,
      set: (name: string, value: string) => headersMap.set(name, value)
    };
  }
  
  async json() {
    return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
  }
  
  async text() {
    return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
  }
  
  clone() {
    return new MockResponse(this.body, this.init);
  }
};

// Mock File and FormData
(global as any).File = class MockFile {
  constructor(
    public parts: any[],
    public name: string,
    public options?: { type?: string; lastModified?: number }
  ) {}
  
  get type() {
    return this.options?.type || 'application/octet-stream';
  }
  
  get size() {
    return 1024; // Mock size
  }
  
  stream() {
    return new ReadableStream();
  }
};

(global as any).FormData = class MockFormData {
  private data = new Map();
  
  append(name: string, value: any) {
    if (!this.data.has(name)) {
      this.data.set(name, []);
    }
    this.data.get(name).push(value);
  }
  
  get(name: string) {
    const values = this.data.get(name);
    return values ? values[0] : null;
  }
  
  getAll(name: string) {
    return this.data.get(name) || [];
  }
};

// Mock console methods for cleaner test output
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
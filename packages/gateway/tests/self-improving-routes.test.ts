import { describe, it, expect, vi } from 'vitest';
import { mountSelfImprovingRoutes } from '../src/self-improving-routes.js';

describe('Self-Improving Routes', () => {
  it('learnings handler returns data from store', () => {
    const routes: Record<string, Function> = {};
    const mockApp = {
      get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
    } as any;

    const mockStore = {
      getRecent: vi.fn().mockReturnValue([
        { id: 1, content: 'test', category: 'note', jobType: 'build', occurrences: 1, createdAt: 1000 },
      ]),
      getByCategory: vi.fn(),
    };

    mountSelfImprovingRoutes(mockApp, { learningStore: mockStore });

    const mockReq = { query: {} } as any;
    const mockRes = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    routes['/api/v1/learnings'](mockReq, mockRes);

    expect(mockStore.getRecent).toHaveBeenCalledWith(20);
    expect(mockRes.json).toHaveBeenCalledWith({
      learnings: [{ id: 1, content: 'test', category: 'note', jobType: 'build', occurrences: 1, createdAt: 1000 }],
      count: 1,
    });
  });

  it('learnings handler filters by category', () => {
    const routes: Record<string, Function> = {};
    const mockApp = {
      get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
    } as any;

    const mockStore = {
      getRecent: vi.fn(),
      getByCategory: vi.fn().mockReturnValue([
        { id: 1, content: 'Be careful', category: 'warning', jobType: 'build', occurrences: 1, createdAt: 1000 },
      ]),
    };

    mountSelfImprovingRoutes(mockApp, { learningStore: mockStore });

    const mockReq = { query: { category: 'warning' } } as any;
    const mockRes = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    routes['/api/v1/learnings'](mockReq, mockRes);

    expect(mockStore.getByCategory).toHaveBeenCalledWith('warning');
    expect(mockRes.json).toHaveBeenCalledWith({
      learnings: [{ id: 1, content: 'Be careful', category: 'warning', jobType: 'build', occurrences: 1, createdAt: 1000 }],
      count: 1,
    });
  });

  it('learnings handler clamps limit between 1 and 100', () => {
    const routes: Record<string, Function> = {};
    const mockApp = {
      get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
    } as any;

    const mockStore = {
      getRecent: vi.fn().mockReturnValue([]),
      getByCategory: vi.fn(),
    };

    mountSelfImprovingRoutes(mockApp, { learningStore: mockStore });

    const mockRes = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    routes['/api/v1/learnings']({ query: { limit: '999' } } as any, mockRes);
    expect(mockStore.getRecent).toHaveBeenCalledWith(100);

    routes['/api/v1/learnings']({ query: { limit: '0' } } as any, mockRes);
    expect(mockStore.getRecent).toHaveBeenCalledWith(20); // parseInt('0') is falsy, defaults to 20

    routes['/api/v1/learnings']({ query: { limit: '5' } } as any, mockRes);
    expect(mockStore.getRecent).toHaveBeenCalledWith(5);
  });

  it('changelog handler returns data from change log', () => {
    const routes: Record<string, Function> = {};
    const mockApp = {
      get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
    } as any;

    const mockLog = {
      getRecent: vi.fn().mockReturnValue([
        { id: 1, component: 'cooldown', description: 'Changed', reason: 'R', createdAt: 1000 },
      ]),
      getByComponent: vi.fn(),
    };

    mountSelfImprovingRoutes(mockApp, { changeLog: mockLog });

    const mockReq = { query: {} } as any;
    const mockRes = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    routes['/api/v1/changelog'](mockReq, mockRes);

    expect(mockLog.getRecent).toHaveBeenCalledWith(20);
    expect(mockRes.json).toHaveBeenCalledWith({
      entries: [{ id: 1, component: 'cooldown', description: 'Changed', reason: 'R', createdAt: 1000 }],
      count: 1,
    });
  });

  it('changelog handler filters by component', () => {
    const routes: Record<string, Function> = {};
    const mockApp = {
      get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
    } as any;

    const mockLog = {
      getRecent: vi.fn(),
      getByComponent: vi.fn().mockReturnValue([
        { id: 1, component: 'cooldown', description: 'Changed', reason: 'R', createdAt: 1000 },
      ]),
    };

    mountSelfImprovingRoutes(mockApp, { changeLog: mockLog });

    const mockReq = { query: { component: 'cooldown' } } as any;
    const mockRes = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    routes['/api/v1/changelog'](mockReq, mockRes);

    expect(mockLog.getByComponent).toHaveBeenCalledWith('cooldown');
  });

  it('returns 503 when stores unavailable', () => {
    const routes: Record<string, Function> = {};
    const mockApp = {
      get: vi.fn((path: string, handler: Function) => { routes[path] = handler; }),
    } as any;

    mountSelfImprovingRoutes(mockApp, {});

    const mockReq = { query: {} } as any;
    const mockRes = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

    routes['/api/v1/learnings'](mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Learning store not available' });

    mockRes.status.mockClear();
    mockRes.json.mockClear();

    routes['/api/v1/changelog'](mockReq, mockRes);
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Change log not available' });
  });
});

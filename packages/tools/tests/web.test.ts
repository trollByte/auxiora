import { describe, it, expect } from 'vitest';

// Import htmlToMarkdown directly — WebBrowserTool triggers index.ts side effects
// so we test the conversion logic and SPA detection threshold in isolation
import { htmlToMarkdown } from '../src/web.js';

describe('htmlToMarkdown', () => {
  it('should convert headings', () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('# Title');
    expect(md).toContain('## Subtitle');
  });

  it('should convert links', () => {
    const html = '<a href="https://example.com">click</a>';
    expect(htmlToMarkdown(html)).toContain('[click](https://example.com)');
  });

  it('should convert list items', () => {
    const html = '<li>First</li><li>Second</li>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('- First');
    expect(md).toContain('- Second');
  });

  it('should convert paragraphs', () => {
    const html = '<p>Hello world</p>';
    expect(htmlToMarkdown(html)).toContain('Hello world');
  });

  it('should strip script and style tags', () => {
    const html = '<script>void 0</script><style>.x{}</style><p>safe</p>';
    const md = htmlToMarkdown(html);
    expect(md).not.toContain('void');
    expect(md).not.toContain('.x');
    expect(md).toContain('safe');
  });

  it('should decode HTML entities', () => {
    const html = '&amp; &lt; &gt; &quot; &#39;';
    const md = htmlToMarkdown(html);
    expect(md).toContain('&');
    expect(md).toContain('<');
    expect(md).toContain('>');
    expect(md).toContain('"');
    expect(md).toContain("'");
  });

  it('should return empty string for empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
  });

  it('should produce near-empty output for SPA shell pages', () => {
    // This simulates what help.obsidian.md returns: big HTML, no content
    const spaHtml = `<!DOCTYPE html><html><head>
      <script type="module" src="/app.js"></script>
      <link rel="stylesheet" href="/style.css">
      <meta charset="utf-8">
      </head><body>
      <div id="app"></div>
      <script>
        window.addEventListener('load', function() {
          var el = document.getElementById('app');
          fetch('/api/content').then(function(r) { return r.json(); }).then(function(data) {
            el.textContent = data.text;
          });
        });
      </script>
      </body></html>`;

    const md = htmlToMarkdown(spaHtml);
    // SPA pages produce very little text after stripping scripts
    // The web tool uses this heuristic: html.length > 512 && md.length < 100
    expect(spaHtml.length).toBeGreaterThan(512);
    expect(md.length).toBeLessThan(100);
  });

  it('should produce substantial output for content-rich pages', () => {
    const normalHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body>
      <h1>Welcome to the Documentation</h1>
      <p>This is a normal page with plenty of readable content that should be extracted properly.</p>
      <h2>Getting Started</h2>
      <p>Follow these steps to get started with the tool.</p>
      <ul><li>Step one: install</li><li>Step two: configure</li><li>Step three: run</li></ul>
      </body></html>`;

    const md = htmlToMarkdown(normalHtml);
    expect(md.length).toBeGreaterThan(100);
    expect(md).toContain('# Welcome to the Documentation');
    expect(md).toContain('Getting Started');
  });
});

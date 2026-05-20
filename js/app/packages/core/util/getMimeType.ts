import { match } from 'ts-pattern';

// Map file extension to MIME type
export const getMimeType = (ext: string) => {
  return match(ext.toLowerCase())
    .with('.txt', () => 'text/plain')
    .with('.js', () => 'application/javascript')
    .with('.jsx', () => 'text/jsx')
    .with('.ts', () => 'application/typescript')
    .with('.tsx', () => 'text/tsx')
    .with('.json', () => 'application/json')
    .with('.html', () => 'text/html')
    .with('.css', () => 'text/css')
    .with('.md', () => 'text/markdown')
    .with('.py', () => 'text/x-python')
    .with('.java', () => 'text/x-java-source')
    .with('.c', () => 'text/x-c')
    .with('.cpp', () => 'text/x-c++')
    .with('.rs', () => 'text/rust')
    .with('.go', () => 'text/x-go')
    .with('.rb', () => 'text/ruby')
    .with('.php', () => 'application/x-httpd-php')
    .with('.sql', () => 'application/sql')
    .with('.xml', () => 'application/xml')
    .with('.yaml', '.yml', () => 'application/x-yaml')
    .with('.pdf', () => 'application/pdf')
    .with(
      '.docx',
      () =>
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    .otherwise(() => 'text/plain');
};

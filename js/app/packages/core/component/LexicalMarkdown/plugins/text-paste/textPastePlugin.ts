import type { BlockAlias, BlockName } from '@core/block';
import type { GithubLinkType } from '@lexical-core';
import { mergeRegister } from '@lexical/utils';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  type LexicalEditor,
  PASTE_COMMAND,
} from 'lexical';
import {
  INSERT_DOCUMENT_MENTION_COMMAND,
  INSERT_GITHUB_MENTION_COMMAND,
} from '../mentions';

type MacroAppUrlParsed = {
  isValid: boolean;
  id: string | undefined;
  block: BlockName | BlockAlias | undefined;
  params: Record<string, string> | undefined;
};
const Hosts = {
  Prod: 'macro.com',
  Dev: 'dev.macro.com',
  Staging: 'staging.macro.com',
  Localhost: 'localhost',
} as const;

function cleanHostname(hostname: string): string {
  return hostname.replace('www.', '').toLowerCase();
}

function isValidMentionHostname(hostname: string): boolean {
  const current = cleanHostname(window.location.hostname);
  const target = cleanHostname(hostname);
  if (current === target) {
    return true;
  }
  if (
    (target === Hosts.Dev && current === Hosts.Localhost) ||
    (target === Hosts.Localhost && current === Hosts.Dev)
  ) {
    return true;
  }
  return false;
}

export function parseMacroAppUrl(text: string): MacroAppUrlParsed {
  try {
    const url: URL = new URL(text);
    if (
      !url.pathname.startsWith('/app/') ||
      !isValidMentionHostname(url.hostname)
    ) {
      return {
        isValid: false,
        id: undefined,
        block: undefined,
        params: undefined,
      };
    }

    const pathParts: string[] = url.pathname.split('/').filter((part) => part);
    if (pathParts.length < 3) {
      return {
        isValid: false,
        id: undefined,
        block: undefined,
        params: undefined,
      };
    }

    const validTypes: Array<BlockName | BlockAlias> = [
      'chat',
      'write',
      'pdf',
      'md',
      'task',
      'code',
      'image',
      'canvas',
      'channel',
      'project',
      'email',
    ];
    const _block: string = pathParts[1];
    if (!validTypes.includes(_block as any)) {
      return {
        isValid: false,
        id: undefined,
        block: undefined,
        params: undefined,
      };
    }
    const block: BlockName | BlockAlias = _block as BlockName | BlockAlias;

    const idRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!idRegex.test(pathParts[2])) {
      return {
        isValid: false,
        id: undefined,
        block: undefined,
        params: undefined,
      };
    }

    const id: string = pathParts[2];
    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return {
      isValid: true,
      id: id,
      block: block,
      params: params,
    };
  } catch {
    return {
      isValid: false,
      id: undefined,
      block: undefined,
      params: undefined,
    };
  }
}

type GithubUrlParsed = {
  isValid: boolean;
  url: string;
  owner: string;
  repo: string;
  linkType: GithubLinkType;
  number?: number;
};

const GITHUB_HOSTS = ['github.com', 'www.github.com'] as const;

export function parseGithubUrl(text: string): GithubUrlParsed {
  const invalid: GithubUrlParsed = {
    isValid: false,
    url: '',
    owner: '',
    repo: '',
    linkType: 'unknown',
  };

  try {
    const url = new URL(text);
    const hostname = url.hostname.toLowerCase();

    if (!GITHUB_HOSTS.includes(hostname as any)) {
      return invalid;
    }

    // Parse path: /{owner}/{repo}[/pull|issues/{number}]
    const pathParts = url.pathname.split('/').filter((part) => part);

    if (pathParts.length < 2) {
      return invalid;
    }

    const owner = pathParts[0];
    const repo = pathParts[1];

    // Validate owner and repo names (basic validation)
    const validNameRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!validNameRegex.test(owner) || !validNameRegex.test(repo)) {
      return invalid;
    }

    let linkType: GithubLinkType = 'repo';
    let number: number | undefined;

    // Check for PR or issue
    if (pathParts.length >= 4) {
      const typeSegment = pathParts[2];
      const numberStr = pathParts[3];

      if (typeSegment === 'pull') {
        linkType = 'pull';
        const parsed = parseInt(numberStr, 10);
        if (!isNaN(parsed) && parsed > 0) {
          number = parsed;
        }
      } else if (typeSegment === 'issues') {
        linkType = 'issue';
        const parsed = parseInt(numberStr, 10);
        if (!isNaN(parsed) && parsed > 0) {
          number = parsed;
        }
      }
    }

    return {
      isValid: true,
      url: text,
      owner,
      repo,
      linkType,
      number,
    };
  } catch {
    return invalid;
  }
}

function registerTextPastePlugin(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(
      PASTE_COMMAND,
      (event: InputEvent | ClipboardEvent) => {
        if (event instanceof ClipboardEvent) {
          const pastedText: string =
            event.clipboardData?.getData('text/plain') || '';

          const selection = $getSelection();
          if ($isRangeSelection(selection) && !selection.isCollapsed())
            return false;

          // Try GitHub URL first
          const parsedGithubUrl = parseGithubUrl(pastedText);
          if (parsedGithubUrl.isValid) {
            event.preventDefault();
            editor.dispatchCommand(INSERT_GITHUB_MENTION_COMMAND, {
              url: parsedGithubUrl.url,
              owner: parsedGithubUrl.owner,
              repo: parsedGithubUrl.repo,
              linkType: parsedGithubUrl.linkType,
              number: parsedGithubUrl.number,
            });
            return true;
          }

          // Try Macro app URL
          const parsedMacroAppUrl = parseMacroAppUrl(pastedText);
          if (
            !parsedMacroAppUrl.isValid ||
            !parsedMacroAppUrl.id ||
            !parsedMacroAppUrl.block
          ) {
            return false;
          }

          event.preventDefault();
          editor.dispatchCommand(INSERT_DOCUMENT_MENTION_COMMAND, {
            documentId: parsedMacroAppUrl.id,
            documentName: '',
            blockName: parsedMacroAppUrl.block,
            blockParams: parsedMacroAppUrl.params || {},
          });
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    )
  );
}

export function textPastePlugin() {
  return (editor: LexicalEditor) => registerTextPastePlugin(editor);
}

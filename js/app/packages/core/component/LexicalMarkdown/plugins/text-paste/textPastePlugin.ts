import type { BlockAlias, BlockName } from '@core/block';
import { $createGithubMentionNode } from '@lexical-core';
import { mergeRegister } from '@lexical/utils';
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $wrapNodeInElement,
  COMMAND_PRIORITY_HIGH,
  type LexicalEditor,
  PASTE_COMMAND,
} from 'lexical';
import { INSERT_DOCUMENT_MENTION_COMMAND } from '../mentions';

type MacroAppUrlParsed = {
  isValid: boolean;
  id: string | undefined;
  block: BlockName | BlockAlias | undefined;
  params: Record<string, string> | undefined;
};

type GithubUrlParsed = {
  isValid: boolean;
  url: string | undefined;
  slug: string | undefined;
};

const Hosts = {
  Prod: 'macro.com',
  Dev: 'dev.macro.com',
  Staging: 'staging.macro.com',
  Localhost: 'localhost',
  Github: 'github.com',
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

function parseGithubPullUrl(text: string): GithubUrlParsed {
  try {
    const url = new URL(text);
    if (cleanHostname(url.hostname) !== Hosts.Github) {
      return { isValid: false, url: undefined, slug: undefined };
    }

    const pathParts = url.pathname.split('/').filter((part) => part);
    if (pathParts.length < 4) {
      return { isValid: false, url: undefined, slug: undefined };
    }

    const [owner, repo, type, number] = pathParts;
    if (type !== 'pull' || !owner || !repo || !number) {
      return { isValid: false, url: undefined, slug: undefined };
    }

    return {
      isValid: true,
      url: url.toString(),
      slug: `${owner}/${repo}/pull/${number}`,
    };
  } catch {
    return { isValid: false, url: undefined, slug: undefined };
  }
}

function registerTextPastePlugin(editor: LexicalEditor) {
  return mergeRegister(
    editor.registerCommand(
      PASTE_COMMAND,
      (event: InputEvent | ClipboardEvent) => {
        if (!(event instanceof ClipboardEvent)) return false;

        const pastedText: string =
          event.clipboardData?.getData('text/plain')?.trim() || '';

        const parsedMacroAppUrl = parseMacroAppUrl(pastedText);
        if (
          parsedMacroAppUrl.isValid &&
          parsedMacroAppUrl.id &&
          parsedMacroAppUrl.block
        ) {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && !selection.isCollapsed())
            return false;

          event.preventDefault();
          editor.dispatchCommand(INSERT_DOCUMENT_MENTION_COMMAND, {
            documentId: parsedMacroAppUrl.id,
            documentName: '',
            blockName: parsedMacroAppUrl.block,
            blockParams: parsedMacroAppUrl.params || {},
          });
          return true;
        }

        const parsedGithubUrl = parseGithubPullUrl(pastedText);
        if (
          parsedGithubUrl.isValid &&
          parsedGithubUrl.url &&
          parsedGithubUrl.slug
        ) {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && !selection.isCollapsed())
            return false;

          event.preventDefault();
          editor.update(() => {
            const mentionNode = $createGithubMentionNode({
              url: parsedGithubUrl.url,
              slug: parsedGithubUrl.slug,
            });

            $insertNodes([mentionNode]);
            if ($isRootOrShadowRoot(mentionNode.getParentOrThrow())) {
              $wrapNodeInElement(mentionNode, $createParagraphNode);
            }
            mentionNode.selectEnd();
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

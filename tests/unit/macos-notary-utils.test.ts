import { describe, expect, it } from 'vitest';
import {
  findDeveloperIdApplicationIdentities,
  parseTeamIdentifier,
  resolveDeveloperIdApplicationIdentity,
  selectDeveloperIdApplicationIdentity,
} from '../../scripts/macos-notary-utils.cjs';

describe('macos notary utils', () => {
  it('parses TeamIdentifier from codesign details output', () => {
    expect(
      parseTeamIdentifier(`
Executable=/tmp/LawClaw.app/Contents/MacOS/LawClaw
TeamIdentifier=G52MS3PL77
Runtime Version=26.0.0
`)
    ).toBe('G52MS3PL77');
  });

  it('extracts Developer ID Application identities from security output', () => {
    expect(
      findDeveloperIdApplicationIdentities(`
  1) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Developer ID Application: Jurismind Inc. (G52MS3PL77)"
  2) BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB "Apple Development: Example (OTHERTEAM)"
  3) CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC "Developer ID Application: Another Org (ZZZZZZZZZZ)"
     3 valid identities found
`)
    ).toEqual([
      'Developer ID Application: Jurismind Inc. (G52MS3PL77)',
      'Developer ID Application: Another Org (ZZZZZZZZZZ)',
    ]);
  });

  it('prefers the explicit CSC_NAME when provided', () => {
    expect(
      selectDeveloperIdApplicationIdentity({
        candidates: ['Developer ID Application: Jurismind Inc. (G52MS3PL77)'],
        cscName: 'Developer ID Application: Explicit Choice (MANUALTEAM)',
        teamIdentifier: 'G52MS3PL77',
      })
    ).toBe('Developer ID Application: Explicit Choice (MANUALTEAM)');
  });

  it('selects the Developer ID Application identity matching the signed app team', () => {
    expect(
      selectDeveloperIdApplicationIdentity({
        candidates: [
          'Developer ID Application: Another Org (ZZZZZZZZZZ)',
          'Developer ID Application: Jurismind Inc. (G52MS3PL77)',
        ],
        teamIdentifier: 'G52MS3PL77',
      })
    ).toBe('Developer ID Application: Jurismind Inc. (G52MS3PL77)');
  });

  it('throws when multiple identities remain ambiguous', () => {
    expect(() =>
      selectDeveloperIdApplicationIdentity({
        candidates: [
          'Developer ID Application: Org One (TEAMONE111)',
          'Developer ID Application: Org Two (TEAMTWO222)',
        ],
      })
    ).toThrow('Multiple Developer ID Application identities found');
  });

  it('queries an explicit signing keychain when resolving the Developer ID Application identity', () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const appPath = '/tmp/LawClaw.app';
    const keychainFile = '/tmp/lawclaw-signing.keychain-db';

    const identity = resolveDeveloperIdApplicationIdentity(
      appPath,
      { CSC_KEYCHAIN: keychainFile },
      '[test]',
      {
        runTextImpl(command: string, args: string[]) {
          calls.push({ command, args });

          if (command === 'codesign') {
            return `
Executable=${appPath}/Contents/MacOS/LawClaw
TeamIdentifier=G52MS3PL77
Runtime Version=26.0.0
`;
          }

          return `
  1) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Developer ID Application: Jurismind Inc. (G52MS3PL77)"
     1 valid identities found
`;
        },
      }
    );

    expect(identity).toBe('Developer ID Application: Jurismind Inc. (G52MS3PL77)');
    expect(calls).toEqual([
      {
        command: 'codesign',
        args: ['-dv', '--verbose=4', appPath],
      },
      {
        command: 'security',
        args: ['find-identity', '-v', '-p', 'codesigning', keychainFile],
      },
    ]);
  });
});

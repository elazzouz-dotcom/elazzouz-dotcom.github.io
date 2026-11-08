from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
bridge = (ROOT / 'onecompiler-publish-bridge.js').read_text(encoding='utf-8')
guide = (ROOT / 'ONECOMPILER-PUBLISH-GUIDE.md').read_text(encoding='utf-8')
snippet = (ROOT / 'onecompiler-publish-snippet.html').read_text(encoding='utf-8')

expected = {
    'Worker URL': 'https://github-oauth-proxy.elazzouz4.workers.dev',
    'owner': "owner: 'elazzouz-dotcom'",
    'repo': "repo: 'elazzouz-dotcom.github.io'",
    'branch': "branch: 'main'",
    'bridge URL': 'https://elazzouz-dotcom.github.io/onecompiler-publish-bridge.js',
}
errors = []
for label, value in expected.items():
    if value not in bridge and value not in guide and value not in snippet:
        errors.append(f'missing stable {label}: {value}')

if 'OneCompilerGitHub.publishToGitHub' not in bridge:
    errors.append('bridge does not expose publishToGitHub')
for name, text in [('guide', guide), ('snippet', snippet)]:
    if 'onecompiler-publish-bridge.js' not in text:
        errors.append(f'{name} does not reference the bridge')
    if 'OneCompilerGitHub.publishToGitHub' not in text:
        errors.append(f'{name} does not reference publishToGitHub')

if errors:
    raise SystemExit('\n'.join(errors))
print('OK: OneCompiler integration contract is stable')

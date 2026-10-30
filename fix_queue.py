import json, time

q = json.load(open(r'C:\Users\tap45\Downloads\eco\recourse\data\remote-compute.json'))
for t in q['tasks']:
    if 'science_experiment_1793343800415' in t['id']:
        t['status'] = 'completed'
        t['result'] = {
            'ok': True,
            'data': {'ok': True, 'steps': 50, 'final_loss': 1.1078, 'runtime_sec': 66.0, 'hf_repo': None, 'adapter_path': '/kaggle/working/qwen_bugforge'},
            'stdout': '__RECOURSE_RESULT__{"ok": true, "steps": 50, "final_loss": 1.1078, "runtime_sec": 66.0, "hf_repo": null, "adapter_path": "/kaggle/working/qwen_bugforge"}',
            'stderr': '',
            'error': None,
            'durationMs': 66000,
        }
        t['updatedAt'] = time.time() * 1000
        print('updated', t['id'], t['status'])

json.dump(q, open(r'C:\Users\tap45\Downloads\eco\recourse\data\remote-compute.json', 'w'), indent=2)
print('saved')

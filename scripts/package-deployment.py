"""Package catalog and display assets for Render's private persistent disk.

Does not include originals, credentials, local dependencies or backup history.
The archive contains private catalog data; do not commit it or publish it as a URL.
"""
import hashlib,json,tarfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
data=root/'data'
paths=[data/'catalog.json',data/'reviews.json']
catalog=json.loads(paths[0].read_text(encoding='utf-8'))
for p in catalog['photos']:
    for kind in ['previews','labels']:paths.append(data/kind/(p['id']+'.jpg'))
manifest=[]
for path in paths:
    if not path.is_file():raise FileNotFoundError(path)
    manifest.append({'path':path.relative_to(data).as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
folder=root/'deployment-data';folder.mkdir(exist_ok=True)
(folder/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
with tarfile.open(folder/'gengar-data.tar.gz','w:gz') as archive:
    for path in paths:archive.add(path,arcname=path.relative_to(data).as_posix())
    archive.add(folder/'manifest.json',arcname='manifest.json')
print(json.dumps({'files':len(paths),'archive_bytes':(folder/'gengar-data.tar.gz').stat().st_size,'archive':str(folder/'gengar-data.tar.gz')},indent=2))

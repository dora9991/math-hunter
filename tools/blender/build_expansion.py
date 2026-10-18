"""Blender --background --python tools/blender/build_expansion.py"""
import sys, runpy
from pathlib import Path
folder=Path(__file__).resolve().parent
sys.path.insert(0,str(folder))
from expansion_forms import SPEC
selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(SPEC)
for monster in selected:
    sys.argv=['bestiary_build.py','--',monster]
    runpy.run_path(str(folder/'bestiary_build.py'),run_name='__main__')

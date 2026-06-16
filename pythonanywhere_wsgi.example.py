import os
import sys


project_home = "/home/YOUR_USERNAME/veerhau_game_companion"
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Change this in the PythonAnywhere WSGI file, not in a public repository.
os.environ["CHRONICLE_PASSWORD"] = "change-this-password"
os.environ["CHRONICLE_DATA_DIR"] = os.path.join(project_home, "data")

from wsgi import application

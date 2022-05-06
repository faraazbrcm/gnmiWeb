# importing module
import logging
import sys
import logging.handlers
import os
import errno

LOG_FILENAME = "logs/server.log"

def mkdir_p(path):
    try:
        os.makedirs(path, exist_ok=True)  # Python>3.2
    except TypeError:
        try:
            os.makedirs(path)
        except OSError as exc: # Python >2.5
            if exc.errno == errno.EEXIST and os.path.isdir(path):
                pass
            else: raise

class MakeFileHandler(logging.FileHandler):
    def __init__(self, filename, mode='a', encoding=None, delay=0):            
        mkdir_p(os.path.dirname(filename))
        logging.FileHandler.__init__(self, filename, mode, encoding, delay)

# Create and configure logger
logging.basicConfig(handlers=[
                                MakeFileHandler(LOG_FILENAME),
                                logging.StreamHandler(sys.stdout)
                            ],
                    format='%(asctime)s %(message)s')
 
# Creating an object
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
# Add the log message handler to the logger
handler = logging.handlers.RotatingFileHandler(
              LOG_FILENAME, maxBytes=10000000, backupCount=5)

logger.addHandler(handler)

def log(msg):
    logger.info(msg)
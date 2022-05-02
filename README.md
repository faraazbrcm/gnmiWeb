# Getting Started with gnmiWeb App

## How to start server

***server/server.py*** is the main script.

### Server prerequisite

Install Python 3.x (Preferably 3.10.4 - Tested using this version).

### Steps to start Server App

#### Installing server dependencies

**cd <repo_root>/server**

**python3 -m venv venv**

**source ./venv/bin/activate**

**pip3 install -r requirements.txt**

#### Starting server

**export FLASK_APP=server**

**flask run**

***Note***: The Server uses gNMI certificate based authentication for communication with switch. Switch needs to have certificate configured and set up with below details.

**host name on cert** - localhost

It uses the same certificate which spytest uses. In order to setup certificate on switch automatically execute any spytest gNMI testcase, this will setup the certificate on switch.

### Client prerequisite

Install NodeJs (Preferably v17.9.0 - Tested using this version)
Instruction to install NodeJs and Npm is below

https://upstack.co/knowledge/how-to-install-node-js-on-linux

Alternatively Node can also be installed and used using NVM (Preferred Approach).

Instruction to install NVM is below
https://github.com/nvm-sh/nvm#installing-and-updating

### Steps to start Client App

**cd <repo_root>**

**npm install**

**npm start**

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

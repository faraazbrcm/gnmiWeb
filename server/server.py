
from flask_socketio import SocketIO
from flask import Flask, abort, jsonify, make_response, request, Response, stream_with_context
from gnmi import GNMIConnection, gNMIError, extract_gnmi_val
import grpc
import pdb
import json

static_files = {
    '/': {'filename': 'index.html', 'content_type': 'text/html'},
}
sessions = {}
app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
sio = SocketIO(app)

def gnmi_disconnect(sid, remove_sid=False):
    if sid in sessions:
        for rpc in sessions[sid]["rpc"]:
            sessions[sid]["rpc"][rpc].cancel()
        if sessions[sid]["gnmi_con"]:
            sessions[sid]["gnmi_con"].disconnect()
        if remove_sid:
            del sessions[sid]

@sio.event
def connect(auth):
    sid = request.sid
    print(f"========= Connect Received- {sid} =========")
    if sid not in sessions:
        sessions[sid] = {"gnmi_con": None, "rpc": {}}
    sio.emit("sid", sid, room=sid)

@sio.event
def disconnect():
    sid = request.sid
    print(f"========= Disconnect Received- {sid} =========")
    gnmi_disconnect(sid, remove_sid=True)

@app.route("/connect/<string:sid>/<string:switch_ip>/<string:username>/<string:password>", methods=["post"])
def switch_connect(sid, switch_ip, username, password):
    print(f"GNMI connect Request, sid = {sid} switch-IP={switch_ip}")
    if sid not in sessions:
        abort(402)    
    con = GNMIConnection(dut=switch_ip, username=username, password=password)
    if con.connect():
        sessions[sid]["gnmi_con"] = con
        data = {'message': 'gNMI connection successful', 'code': 'SUCCESS'}
        return make_response(jsonify(data), 201)
    else:
        abort(400)

@app.route("/disconnect/<string:sid>/<string:switch_ip>", methods=["post"])
def switch_disconnect(sid, switch_ip):
    print(f"GNMI Disconnect Request sid = {sid} switch-IP={switch_ip}")
    if sid not in sessions:
        abort(402)
    gnmi_disconnect(sid)
    data = {'message': 'gNMI Disconnection successful', 'code': 'SUCCESS'}
    return make_response(jsonify(data), 201)


@app.route("/faraaz", methods=["get"])
def faraaz():
    import time
    count = 3
    @stream_with_context
    def generate(count):
        while count != 0:
            count = count - 1
            time.sleep(3)
            b = {"count": count}
            #yield "<p>faraaz</p>"
            yield json.dumps(b) + '\n'
    return app.response_class(generate(count), mimetype='text/json')
    #return Response(generate(count))

@app.route("/<string:sid>/get_vlans", methods=["get"])
def get_vlans(sid):
    path = '/sonic-vlan:sonic-vlan'
    resp, status = sessions[sid]["gnmi_con"].gnmi_get(path)
    for key in resp:
        payloadStr = resp[key].val.json_ietf_val.decode()
        payloadStr = json.loads(payloadStr)
    if status == 0:
        payload = payloadStr["sonic-vlan:sonic-vlan"]["VLAN"]["VLAN_LIST"]
        print(json.dumps(payload, indent=2))
        status = 200
        data = {'data': payload, 'code': 'SUCCESS'}
    else:
        status = 404
        data = {'data': "Error in getting vlans", 'code': 'FAILURE'}
    return make_response(jsonify(data), status)

def do_update(sid, update):
    server_resp = sessions[sid]["gnmi_con"].gnmi_update(update=update)
    message = "Resource Created!"
    if isinstance(server_resp, grpc.RpcError):
        status = 500
        message = server_resp.details()
    elif isinstance(server_resp, tuple):
        status = server_resp[1]
        if status == 0:
            status = 201
        else:
            if isinstance(server_resp[0], gNMIError):
                status = 500
                message = server_resp[0].details
            else:
                status = 500
    else:
        status = 500
    data = {message:message}
    return make_response(jsonify(data), status)

@app.route("/create_vlan/<string:sid>/<string:vlan>", methods=["post"])
def create_vlan(sid, vlan):
    path = '/openconfig-interfaces:interfaces'
    payload = {"openconfig-interfaces:interfaces": {"interface": [{"name": vlan, "config": {"name": vlan}}]}}
    update = [(path, payload)]
    return do_update(sid, update)

@app.route("/vlan_membership/<string:sid>/<int:vlan>/<string:port>", methods=["post"])
def vlan_membership(sid, vlan, port):
    path = f"/openconfig-interfaces:interfaces/interface[name={port}]/openconfig-if-ethernet:ethernet/openconfig-vlan:switched-vlan/config"
    payload = {"openconfig-vlan:config": {"interface-mode": "ACCESS", "access-vlan": vlan}}
    update = [(path, payload)]
    return do_update(sid, update)

@app.route("/vlan_mtu/<string:sid>/<string:vlan>/<int:mtu>", methods=["post"])
def vlan_mtu(sid, vlan, mtu):
    path = f"/openconfig-interfaces:interfaces/interface[name={vlan}]/config/mtu"
    payload = {"openconfig-interfaces:mtu": mtu}
    update = [(path, payload)]
    return do_update(sid, update)

# @app.route("/<string:sid>/get_vlans", methods=["get"])
# def get_vlans(sid):
#     path = '/sonic-vlan:sonic-vlan'
#     resp, status = sessions[sid]["gnmi_con"].gnmi_get(path)
#     for key in resp:
#         payloadStr = resp[key].val.json_ietf_val.decode()
#         payloadStr = json.loads(payloadStr)
#     if status == 0:
#         payload = payloadStr["sonic-vlan:sonic-vlan"]["VLAN"]["VLAN_LIST"]
#         print(json.dumps(payload, indent=2))
#         status = 200
#         data = {'data': payload, 'code': 'SUCCESS'}
#     else:
#         status = 404
#         data = {'data': "Error in getting vlans", 'code': 'FAILURE'}
#     return make_response(jsonify(data), status)

@app.route("/interface_onchange/<string:sid>/<string:action>", methods=["get"])
def interface_onchange(sid, action):
    if action == "start":
        if sid in sessions and sessions[sid]["gnmi_con"]:
            #admin_status_path = "/openconfig-interfaces:interfaces/interface[name=*]/state/admin-status"
            oper_status_path = "/openconfig-interfaces:interfaces/interface[name=*]/state/oper-status"
            rpc = sessions[sid]["gnmi_con"].gnmi_subscribe_onchange([oper_status_path])
            if "interface_onchange" in sessions[sid]["rpc"]:
                sessions[sid]["rpc"]["interface_onchange"].cancel()
            sessions[sid]["rpc"]["interface_onchange"] = rpc
            def generate(rpc):
                try:
                    for resp in rpc:
                        status = {}
                        print(str(resp))
                        if resp.sync_response:
                            continue
                        for update in resp.update.update:
                            status[resp.update.prefix.elem[1].key['name']] = extract_gnmi_val(update.val)
                            #print(resp.update.prefix.elem[1].key['name'])
                            sio.emit('interface_on_change', status, room=sid)
                except grpc.RpcError as exp:
                    if exp.code() == grpc.StatusCode.CANCELLED:
                        print("********** cancelled ********")
                    else:
                        data = {'message': 'gNMI RPC Failed', 'code': 'SUCCESS'}
                        return make_response(jsonify(data), 500)
            generate(rpc)
            data = {'message': 'gNMI RPC Cancelled', 'code': 'SUCCESS'}
            return make_response(jsonify(data), 201)
        else:
            abort(500)
    elif action == "stop":
        if sid in sessions and sessions[sid]["gnmi_con"]:
            sessions[sid]["rpc"]["interface_onchange"].cancel()
            del(sessions[sid]["rpc"]["interface_onchange"])
            data = {'message': 'gNMI RPC Closed', 'code': 'SUCCESS'}
            return make_response(jsonify(data), 201)
        else:
            abort(500)
    else:
        abort(500)


@app.route("/interface_sample/<string:sid>/<string:eth>/<int:interval>/<string:action>", methods=["get"])
def interface_sample(sid, eth, interval, action):
    if eth == "":
        eth="Ethernet11"
    if action == "start":
        if sid in sessions and sessions[sid]["gnmi_con"]:
            in_pkts_path = f"/openconfig-interfaces:interfaces/interface[name={eth}]/state/counters"
            rpc = sessions[sid]["gnmi_con"].gnmi_subscribe_sample([in_pkts_path], sample_interval=interval)
            if "interface_sample" in sessions[sid]["rpc"]:
                sessions[sid]["rpc"]["interface_sample"].cancel()
            sessions[sid]["rpc"]["interface_sample"] = rpc
            def generate(rpc):
                from random import randint
                count = 1000
                try:
                    for resp in rpc:
                        status = {}
                        #print(str(resp))
                        if resp.sync_response:
                            continue
                        for update in resp.update.update:
                            count = count + 1000
                            stats_name = update.path.elem[0].name
                            stats_val = extract_gnmi_val(update.val)
                            print(stats_name, stats_val)
                            #stats_val= randint(1,500)
                            sio.emit('interface_sample', {stats_name:stats_val}, room=sid)
                except grpc.RpcError as exp:
                    if exp.code() == grpc.StatusCode.CANCELLED:
                        print("********** cancelled ********")
                    else:
                        data = {'message': 'gNMI RPC Failed', 'code': 'SUCCESS'}
                        return make_response(jsonify(data), 500)
            generate(rpc)
            data = {'message': 'gNMI RPC Cancelled', 'code': 'SUCCESS'}
            return make_response(jsonify(data), 201)            
        else:
            abort(500)
    elif action == "stop":
        if sid in sessions and sessions[sid]["gnmi_con"]:
            sessions[sid]["rpc"]["interface_sample"].cancel()
            del(sessions[sid]["rpc"]["interface_sample"])
            data = {'message': 'gNMI RPC Closed', 'code': 'SUCCESS'}
            return make_response(jsonify(data), 201)
        else:
            abort(500)
    else:
        abort(500)

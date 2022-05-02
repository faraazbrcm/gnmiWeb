import grpc
import os
from log import log
from time import monotonic as _time
import gnmi_pb2_grpc
import gnmi_pb2
import ssl
import time
import re
import sys
import queue
import json
from decimal import Decimal
import six

if sys.version_info[0] >= 3:
    unicode = str
    basestring = str

class GNMIReqIter(object):
  def __init__(self, timeout=None):
    self.q = queue.Queue()
    self.timeout = timeout

  def __iter__(self):
    return self

  def put(self, item):
    self.q.put(item)

  def next(self): # Python 2
    return self.__next__()

  def __next__(self):
    return self.q.get(block=True, timeout=self.timeout)

def _format_type(val):
    """Helper to determine the Python type of the provided value from CLI.

    Args:
      val: (str) Value providing from CLI.

    Returns:
      json_value: The provided input corrected into proper Python Type.
    """
    if (val.startswith('-') and val[1:].isdigit()) or (val.isdigit()):
        return int(val)
    if (val.startswith('-') and val[1].isdigit()) or (val[0].isdigit()):
        return float(val)
    if val.capitalize() == 'True':
        return True
    if val.capitalize() == 'False':
        return False

    # The value is a string.
    return val

def _get_typedvalue(json_value, encoding):
    """Get the gNMI val for path definition.

    Args:
    json_value: (str) JSON_IETF .

    Returns:
    gnmi_pb2.TypedValue()
    """

    encoding_to_typedvalue = {'JSON': 'json_val', 'BYTES': 'bytes_val', 'PROTO': 'proto_bytes', 'ASCII': 'ascii_val',
                              'JSON_IETF': 'json_ietf_val'}

    val = gnmi_pb2.TypedValue()
    if six.PY2:
        corrected_val = _format_type(json.dumps(json_value).encode('utf-8'))
    else:
        corrected_val = _format_type(json.dumps(json_value)).encode('utf-8')
    setattr(val, encoding_to_typedvalue.get(encoding), corrected_val)
    return val

def make_list(*args):
    retval = []
    for arg in args:
        if arg is None:
            retval.append(arg)
        elif isinstance(arg, list):
            retval.extend(arg)
        else:
            retval.append(arg)
    return retval

def is_unicode_string(arg):
    return bool(isinstance(arg, (unicode, str)))

def validate_enum(v, e_type):
    if v in e_type.values() + e_type.keys():
        return True
    else:
        return False

def extract_gnmi_val(raw):
    val = None
    if raw.HasField("any_val"):
        val = raw.any_val
    elif raw.HasField("ascii_val"):
        val = raw.ascii_val
    elif raw.HasField("bool_val"):
        val = raw.bool_val
    elif raw.HasField("bytes_val"):
        val = raw.bytes_val
    elif raw.HasField("decimal_val"):
        val = raw.decimal_val
        val = Decimal(str(val.digits / 10**val.precision))
    elif raw.HasField("float_val"):
        val = raw.float_val
    elif raw.HasField("int_val"):
        val = raw.int_val
    elif raw.HasField("json_ietf_val"):
        val = json.loads(raw.json_ietf_val)
    elif raw.HasField("json_val"):
        val = json.loads(raw.json_val)
    elif raw.HasField("leaflist_val"):
        val = []
        for elem in raw.leaflist_val.element:
            val.append(extract_gnmi_val(elem))
    elif raw.HasField("proto_bytes"):
        val = raw.proto_bytes
    elif raw.HasField("string_val"):
        val = raw.string_val
    elif raw.HasField("uint_val"):
        val = raw.uint_val
    else:
        raise ValueError("Unhandled typed value %s" % raw)
    return val

def get_gnmi_path_prefix(prefix, path_list, target='', origin='', dut=None):
    log(f"Prefix  : Prefix - {prefix} Target- {target} origin- {origin} dut={dut}")
    prefix = get_gnmi_path(prefix, target, origin)
    path_rv = []
    for path in make_list(path_list):
        if isinstance(path, GnmiSubscribeOptions):
            log(f"Path    : {path.path} Dut- {dut}")
            path.set_gnmi_path(path.path)
            path_rv.append(path)
        else:
            log(f"Path    : {path} Dut- {dut}")
            path_rv.append(get_gnmi_path(path, ''))
    return prefix, path_rv

_RE_GNMI_PATH_COMPONENT = re.compile(r'''
^
(?P<pname>[^[]+)  # gNMI path name
(\[(?P<key>[a-zA-Z0-9\-]+)   # gNMI path key
=
(?P<value>.*)    # gNMI path value
\])?$
''', re.VERBOSE)


class XpathError(RuntimeError):
    pass

class GnmiSubscribeOptions(object):
    """
    GNMI Subscribe calls will using this to pass subscription options
    """
    def __init__(self, path, sample_interval=20, suppress_redundant=False, heartbeat_interval=None):
        self.path = path
        self.sample_interval = sample_interval
        self.suppress_redundant = suppress_redundant
        self.heartbeat_interval = heartbeat_interval

    def set_gnmi_path(self, path):
        self.path = get_gnmi_path(path, '')

def gnmi_to_xpath(p):
    path_str = ''
    for pe in p.elem:
        path_str += '/' + pe.name + _format_xpath_keys(pe.key)
    return path_str


def _format_xpath_keys(keys):
    key_comps = ""
    for k in sorted(keys):
        v = str(keys[k])
        v = v.replace('\\', '\\\\')  # Escape \ and ] inside the key value
        v = v.replace(']', '\\]')
        key_comps += '[{}={}]'.format(k, v)
    return key_comps

def _parse_path(p_names, target="", origin=""):
    """Parses a list of path names for path keys.
    Args:
      p_names: (list) of path elements, which may include keys.
      target: target string for PATH
      origin: origin string for PATH
    Returns:
      a gnmi_pb2.Path object representing gNMI path elements.
    Raises:
      XpathError: Unable to parse the xpath provided.
    """
    gnmi_elems = []
    for word in p_names:
        word_search = _RE_GNMI_PATH_COMPONENT.search(word)
        if not word_search:  # Invalid path specified.
            raise XpathError('xpath component parse error: %s' % word)
        if word_search.group('key') is not None:  # A path key was provided.
            tmp_key = {}
            if r'\]' in word:
                word = word.replace(r'\]', r'\\')
            for x in re.findall(r'\[([^]]*)\]', word):
                if r"\\" in x.split("=")[-1]:
                    tmp_key[x.split("=")[0]] = x.split("=")[-1].replace(r'\\', r'\]').replace('\\','')
                else:
                    tmp_key[x.split("=")[0]] = x.split("=")[-1]
            gnmi_elems.append(gnmi_pb2.PathElem(name=word_search.group(
                'pname'), key=tmp_key))
        else:
            gnmi_elems.append(gnmi_pb2.PathElem(name=word, key={}))

    return gnmi_pb2.Path(elem=gnmi_elems, target=target, origin=origin)


def _path_names(xpath):
    """Parses the xpath names.
    This takes an input string and converts it to a list of gNMI Path names. Those
    are later turned into a gNMI Path Class object for use in the Get/SetRequests.
    Args:
      xpath: (str) xpath formatted path.
    Returns:
      list of gNMI path names.
    """
    path = []
    insidebracket = False
    begin = 0
    end = 0
    xpath = xpath + '/'
    while end < len(xpath):
        if xpath[end] == "/":
            if insidebracket is False:
                if end > begin:
                    path.append(xpath[begin:end])
                end = end + 1
                begin = end
            else:
                end = end + 1
        elif xpath[end] == "[":
            if (end == 0 or xpath[end - 1] != '\\') and insidebracket is False:
                insidebracket = True
            end = end + 1
        elif xpath[end] == "]":
            if (end == 0 or xpath[end - 1] != '\\') and insidebracket is True:
                insidebracket = False
            end = end + 1
        else:
            end = end + 1
    return path


def get_gnmi_path(xpath, target="", origin=""):
    """ Converts XPATH style path to GNMI PATH with target filled
    Args: YANG style xpath, target string, origin string
    """
    return _parse_path(_path_names(xpath), target, origin)


def get_target(target=''):
    if not target:
        return "Some_Random_Target"
    else:
        return target

class gNMIError(object):
    """
    gNMI Error class
    """
    def __init__(self, path, oper, error, dut=None):
        self.path = path
        self.oper = oper
        self.error = error
        self.code = -1
        self.details = self.error
        self.dut = dut
        self._log_()

    def _log_(self):
        if isinstance(self.error, grpc.RpcError):
            self.code = self.error.code()
            self.details = self.error.details()

        log(f"gNMI {self.oper} failed: code={self.code},  path={self.path}, dut={self.dut}")
        log(f"Details : {self.details}\n, dut={self.dut}")

    def verify_error(self, exp_error):
        """
        Error Validation.
        Ex: gNMIError.verify_error('INVALID_ARGUMENT')
        """
        if self.code != -1 and self.code == grpc.StatusCode[exp_error]:
            return True
        elif self.code == exp_error:
            return True
        log(f"Failed to match {self.code} with exp_error_code {exp_error}, dut={self.dut}")
        return False

    def verify(self, expStatusCode, expErrDetails=""):
        """
        Error Validation.
        Ex: gNMIError.verify('NOT_FOUND', exp_error_message)
        """
        if (self.code == expStatusCode or (hasattr(grpc.StatusCode, expStatusCode) and self.code == grpc.StatusCode[expStatusCode])) \
            and (expErrDetails == "" or str(self.error.details()) == expErrDetails):
            return True

        log(f"Failed to match {self.code} with exp_error_code {expStatusCode}, Dut- {self.dut}")
        return False

    def is_error(self):
        """
        gNMIError.is_error()
        :return: True for not OK status
        """
        if self.code != grpc.StatusCode.OK:
            log(f"Failed with error code - {self.code}, dut={self.dut}")
            return True
        return False

class GNMIConnection(object):

    def __init__(self, dut, trace=False, **kwargs):
        
        self.dut = dut
        self.mgmt_user = kwargs.get('username', "admin")
        self.mgmt_pass = kwargs.get('password', "broadcom")
        self.mgmt_addr = dut
        self.mgmt_port = 8080

        self.__gnmi_channel = None
        self.__gnmi_stub = None
        self.secure = True
        self.gnmi_iter_timeout = None
        self.gnmi_hostname_on_cert = "localhost"
        self.trace = trace
        self.state_enum = {b.value[0]: a for a, b in dict(grpc.ChannelConnectivity.__members__).items()}
    
    def gnmi_trace(self, mode=True, trace='transport_security,tsi'):
        """
        To enable low level API traces to DEBUG.
        REF : https://github.com/grpc/grpc/blob/master/doc/environment_variables.md
        :param mode:
        :param trace:
        :return:
        """
        log('gNMI Trace - {} '.format(mode))
        if mode:
            os.environ["GRPC_TRACE"] = trace
            os.environ["GRPC_VERBOSITY"] = "DEBUG"
        else:
            os.environ["GRPC_TRACE"] = ""
            os.environ["GRPC_VERBOSITY"] = "ERROR"
    def isconnected(self):
        return bool(self.__gnmi_stub)

    def connect(self):
        log(f"GNMI connect to {self.dut}...")
        log(f"Using cred - Username: {self.mgmt_user}, Password: {self.mgmt_pass}, Dut: {self.dut}")
        if self.secure:
            log(f'Getting server cert for GNMI - DUT: {self.dut}')
            cert = self._get_server_cert()
            if cert is not None:
                self.__gnmi_create_stub(cert)
            else:
                log(f"Unable to get server Cert for GNMI, GNMI Stub is not initialized  dut={self.dut}")
                return False
        else:
            self.__gnmi_create_stub(None)
        if not self.__check_gnmi_server_status():
            log(f"Telemetry server is not in working state, GNMI cases may fail, dut={self.dut}")
            return False
        self.restart_on_disconnect()
        return True

    def disconnect(self):
        log(f"GNMI disconnect on Dut-{self.dut}...")
        if self.__gnmi_channel:
            self.__gnmi_channel.close()
            self.__gnmi_channel = None
            self.__gnmi_stub = None

    def _get_server_cert(self):
        log(f"GNMI get server certificate...")
        deadline = _time() + 180
        cert = None
        while cert is None:
            try:
                cert = ssl.get_server_certificate((self.mgmt_addr, self.mgmt_port)).encode('utf-8')
            except Exception as e:
                log(f"Reattempting to get server certs for GNMI due to exception {e}, Dut- {self.dut}")
            if cert is not None:
                break
            if _time() > deadline:
                return cert
            time.sleep(3)
        return cert

    def __gnmi_create_stub(self, cert):
        log(f"GNMI create stub...")
        if self.__gnmi_channel:
            self.__gnmi_channel.unsubscribe(self.connectivity_event_callback)
            self.__gnmi_channel.close()
        ip_port = "{}:{}".format(self.mgmt_addr, self.mgmt_port)
        options = (('grpc.ssl_target_name_override', self.gnmi_hostname_on_cert),)
        if cert:
            creds = gnmi_pb2_grpc.grpc.ssl_channel_credentials(root_certificates=cert, private_key=None,
                                                               certificate_chain=None)
            self.__gnmi_channel = gnmi_pb2_grpc.grpc.secure_channel(ip_port, creds, options)
        else:
            self.__gnmi_channel = gnmi_pb2_grpc.grpc.insecure_channel(ip_port, options)
        self.__gnmi_stub = gnmi_pb2_grpc.gNMIStub(self.__gnmi_channel)

    def restart_on_disconnect(self):
        # listen to channel events and re-connect for TRANSIENT_FAILURE
        self.__gnmi_channel.subscribe(self.connectivity_event_callback)

    def connectivity_event_callback(self, event):
        if event == grpc.ChannelConnectivity.TRANSIENT_FAILURE:
            log(f"Transient failure detected; re-connecting in 5 sec, dut={self.dut}")
            time.sleep(5)
            self.connect()
        else:
            log(f"Channel connectivity Event - {event}")

    def get_channel_state(self):
        if self.__gnmi_channel:
            val = self.__gnmi_channel._channel.check_connectivity_state(True)
            name = self.state_enum[val]
            log(f"Channel connectivity state - {name}")
            return name, val
        return None, None

    def wait_for_ready(self, timeout=30):
        if self.__gnmi_channel:
            state, _ = self.get_channel_state()
            if state != grpc.ChannelConnectivity.READY.name:
                try:
                    gnmi_pb2_grpc.grpc.channel_ready_future(self.__gnmi_channel).result(timeout=timeout)
                    return True
                except grpc.FutureTimeoutError:
                    log(f"Error connecting to server - FutureTimeoutError, dut={self.dut}")
                    return False

    def __check_gnmi_server_status(self):
        log(f"checking GNMI server status DUT - {self.dut}")
        deadline = _time() + 180
        while True:
            path = '/openconfig-system:system/config/hostname'
            response, status = self.gnmi_get(path)
            log(f"GNMI GET response: {response}")
            if status == 0:
                break
            if _time() > deadline:
                return False
            log(f"Rechecking GNMI server status")
            time.sleep(5)
        return True

    def gnmi_set(self, delete=[], replace=[], update=[], encoding='JSON_IETF', origin=''):
        """
        Changing the configuration on the destination network elements.
        Could provide a single attribute or multiple attributes.

        delete:
          - list of paths with the resources to delete. The format is the same as for get() request

        replace:
          - list of tuples where the first entry path provided as a string, and the second entry
            is a dictionary with the configuration to be configured

        update:
          - list of tuples where the first entry path provided as a string, and the second entry
            is a dictionary with the configuration to be configured

        The encoding argument may have the following values per gNMI specification:
          - JSON
          - BYTES
          - PROTO
          - ASCII
          - JSON_IETF

        origin: origin string for PATH
        """
        del_protobuf_paths = []
        replace_msg = []
        update_msg = []
        all_paths = []
        ops_v2k = {v: k for k, v in gnmi_pb2.UpdateResult.Operation.items()}
        rv_fail = (None, -1)

        if not validate_enum(encoding, gnmi_pb2.Encoding):
            return

        self.wait_for_ready()

        if delete:
            log("GNMI SET Delete: ")
            oper_type = 'Delete'
            if isinstance(delete, list):
                all_paths += delete
                try:
                    for pe in delete:
                        log("Path: {}".format(pe))
                        del_protobuf_paths.append(get_gnmi_path(pe, get_target(), origin=origin))

                except Exception:
                    log('Conversion of gNMI paths to the Protobuf format failed')
                    return rv_fail
            else:
                log('The provided input for Set message (delete operation) is not list.')
                return rv_fail

        if replace:
            log("GNMI SET Replace: ")
            oper_type = 'Replace'
            if isinstance(replace, list):
                all_paths += replace
                for ue in replace:
                    if isinstance(ue, tuple):
                        u_path = get_gnmi_path(ue[0], get_target(), origin=origin)
                        u_val = ue[1]
                        log("Path: {}".format(ue[0]))
                        log("Value: {}".format(u_val))
                        replace_msg.append(gnmi_pb2.Update(path=u_path, val=_get_typedvalue(u_val, encoding)))
                    else:
                        log('The input element for Update message must be tuple, got {}.'.format(ue))
                        return rv_fail
            else:
                log('The provided input for Set message (replace operation) is not list.')
                return rv_fail

        if update:
            log("GNMI SET Update: ")
            oper_type = 'Update'
            if isinstance(update, list):
                all_paths += update
                for ue in update:
                    if isinstance(ue, tuple):
                        u_path = get_gnmi_path(ue[0], get_target(), origin=origin)
                        u_val = ue[1]
                        log("Path: {}".format(ue[0]))
                        log("Value: {}".format(u_val))
                        update_msg.append(gnmi_pb2.Update(path=u_path, val=_get_typedvalue(u_val, encoding)))
                    else:
                        log('The input element for Update message must be tuple, got {}.'.format(ue))
                        return rv_fail
            else:
                log('The provided input for Set message (update operation) is not list.')
                return rv_fail

        log("Encoding : {}".format(encoding))
        log("Origin   : {}".format(origin))

        try:
            gnmi_message_request = gnmi_pb2.SetRequest(delete=del_protobuf_paths, update=update_msg,
                                                       replace=replace_msg)
            gnmi_message_response = self.__gnmi_stub.Set(gnmi_message_request,
                                                         metadata=[('username', self.mgmt_user),
                                                                   ('password', self.mgmt_pass)])

            if gnmi_message_response:
                response = {}

                if gnmi_message_response.response:
                    response.update({'response': []})

                    for response_entry in gnmi_message_response.response:
                        response_container = {}

                        # Adding path
                        if response_entry.path and response_entry.path.elem:
                            response_container.update({'path': gnmi_to_xpath(response_entry.path)})
                        else:
                            response_container.update({'path': None})

                        # Adding operation
                        if response_entry.op in ops_v2k:
                            response_container.update({'op': ops_v2k[response_entry.op]})
                        else:
                            response_container.update({'op': 'UNDEFINED'})

                        response['response'].append(response_container)

                log(response)
                return response, 0

            else:
                log('Failed parsing the SetResponse.', dut=self.dut)
                return rv_fail

        except Exception as err:
            return gNMIError(all_paths, oper_type, err, dut=self.dut), -1

    def gnmi_get(self, paths, target=None, encoding='JSON_IETF', origin='', filter_type=None):
        """Create a gNMI GetRequest.
           Args:
               paths: gNMI Path
               target: target string for PATH
               encoding: gNMI encoding value; one of JSON, BYTES, PROTO, ASCII, JSON_IETF
               origin: origin string for PATH
               filter_type: gNMI content filter type; one of CONFIG, STATE, OPERATIONAL
           Returns:
               tuple (data, status)
               data = dict with path as key and value is gnmi_pb2.Update object w.r.t path.
               status = 0 - for RPC with OK status, -1 for RPC with non-OK status
        """
        log("GNMI GET Request.")
        paths = make_list(paths)
        for p in paths:
            log(f"Path   : {p}")
        gnmi_paths = [get_gnmi_path(p, get_target(target), origin) for p in paths]

        self.wait_for_ready()

        try:
            gnmi_get_response = self.__gnmi_stub.Get(
                gnmi_pb2.GetRequest(path=gnmi_paths, encoding=encoding, type=filter_type),
                metadata=[('username', self.mgmt_user),
                          ('password', self.mgmt_pass)])
            response = {}
            if gnmi_get_response:
                if gnmi_get_response.notification:
                    for iterator in gnmi_get_response.notification:
                        for update in iterator.update:
                            xpath = gnmi_to_xpath(update.path)
                            log(f"Received Update Notification: {xpath} : {str(update.val).strip()}")
                            response[xpath] = update
            return response, 0

        except Exception as err:
            return gNMIError(paths, 'Get', err, dut=self.dut), -1

    def gnmi_subscribe_onchange(self, path_list, timeout=None, encoding="JSON_IETF", updates_only=False,
                                target=None, prefix='/', origin=''):
        """Create a gNMI On-Change Subscribe request
           Args:
               path_list:
               timeout:
               encoding: gNMI encoding value; one of JSON, BYTES, PROTO, ASCII, JSON_IETF
               updates_only: Bool value for SubscriptionList.updates_only; default False.
               target: Prefix target str; auto assigns a default value.
               prefix: gNMI Path prefix
               origin: origin string for PATH
           Returns:
               GNMI Request iterator
        """
        log("GNMI ON_CHANGE Subscribe Request.")
        timeout = timeout or self.gnmi_iter_timeout
        return self.__gnmi_subscribe(path_list, timeout, encoding, "ON_CHANGE",
                                     updates_only=updates_only, target=target, prefix=prefix, origin=origin)

    def gnmi_subscribe_sample(self, path_list, timeout=None, encoding="JSON", updates_only=False,
                              sample_interval=20, suppress_redundant=False, heartbeat_interval=None,
                              target=None, prefix='/', origin=''):
        """Create a gNMI Sample Subscribe request
           Args:
               path_list: gNMI Path
               timeout:
               encoding: gNMI encoding value; one of JSON, BYTES, PROTO, ASCII, JSON_IETF
               updates_only: Bool value for SubscriptionList.updates_only; default False.
               sample_interval:
               suppress_redundant:
               heartbeat_interval:
               target: Prefix target str; auto assigns a default value.
               prefix: gNMI Path prefix
               origin: origin string for PATH
           Returns:
               GNMI Request iterator
        """
        log("GNMI SAMPLE Subscribe Request.")
        timeout = timeout or self.gnmi_iter_timeout
        path_li = []
        for p in make_list(path_list):
            if is_unicode_string(p):
                path_li.append(GnmiSubscribeOptions(p, sample_interval=sample_interval,
                                                    suppress_redundant=suppress_redundant,
                                                    heartbeat_interval=heartbeat_interval))
            elif isinstance(p, GnmiSubscribeOptions):
                path_li.append(p)
        return self.__gnmi_subscribe(path_li, timeout, encoding, "SAMPLE",
                                     updates_only=updates_only, target=target, prefix=prefix, origin=origin)

    def __gnmi_subscribe(self, path_list, timeout=None, encoding="JSON", mode="ON_CHANGE",
                         query_type="STREAM", updates_only=False,
                         target=None, prefix='/', origin=''):
        """Create a gNMI On-Change Subscribe request
           Args:
               path_list: gNMI Path
               prefix: gNMI Path prefix
               encoding: gNMI encoding value; one of JSON, BYTES, PROTO, ASCII, JSON_IETF
               mode: SAMPLE, ON_CHANGE, TARGET_DEFINED
               query_type: STREAM, POLL, ONCE
               updates_only: Bool value for SubscriptionList.updates_only; default False.
               target: Prefix target str; auto assigns a default value.
               prefix: gNMI Path prefix
               origin: origin string for PATH
           Returns:
               GNMI Request iterator
        """
        sub_type = "{} {}".format(query_type, mode)
        target = get_target(target)
        prefix, path_list = get_gnmi_path_prefix(prefix, path_list, target, origin, self.dut)
        timeout = timeout or self.gnmi_iter_timeout
        log(f"Encoding : {encoding} Timeout : {timeout}")

        if not validate_enum(encoding, gnmi_pb2.Encoding):
            return

        subs = []
        for path_entry in path_list:
            opt_dict = dict()
            opt_dict["mode"] = mode
            if isinstance(path_entry, gnmi_pb2.Path):
                opt_dict["path"] = path_entry
            elif isinstance(path_entry, GnmiSubscribeOptions):
                opt_dict["path"] = path_entry.path
                if path_entry.sample_interval is not None:
                    opt_dict["sample_interval"] = path_entry.sample_interval * 1000000000
                if path_entry.suppress_redundant:
                    opt_dict["suppress_redundant"] = path_entry.suppress_redundant
                if path_entry.heartbeat_interval is not None:
                    opt_dict["heartbeat_interval"] = path_entry.heartbeat_interval * 1000000000
            else:
                log('Path entry for subscription can either be GNMI Path or a GnmiSubscribeOptions object')
            sub = gnmi_pb2.Subscription(**opt_dict)
            subs.append(sub)
        sublist = gnmi_pb2.SubscriptionList(prefix=prefix, mode=query_type,
                                            updates_only=updates_only,
                                            encoding=encoding, subscription=subs)
        subreq = gnmi_pb2.SubscribeRequest(subscribe=sublist)

        si = GNMIReqIter(timeout)
        si.put(subreq)

        self.wait_for_ready()

        try:
            metadata = [('username', self.mgmt_user), ('password', self.mgmt_pass)]
            iterator = self.__gnmi_stub.Subscribe(si, metadata=metadata)
            return SubscribeRpc(iterator, si, target=target, encoding=encoding, sub_type=sub_type, path=path_list,
                                origin=origin, timeout=timeout, dut=self.dut)

        except Exception as err:
            return gNMIError(path_list, sub_type, err, dut=self.dut)

    def gnmi_update(self, update=[], encoding='JSON_IETF', origin=''):
        """
        Changing the configuration on the destination network elements.
        Could provide a single attribute or multiple attributes.

        update:
          - list of tuples where the first entry path provided as a string, and the second entry
            is a dictionary with the configuration to be configured

        The encoding argument may have the following values per gNMI specification:
          - JSON
          - BYTES
          - PROTO
          - ASCII
          - JSON_IETF

        origin: origin string for PATH
        """
        return self.gnmi_set(update=update, encoding=encoding, origin=origin)

    def gnmi_replace(self, replace=[], encoding='JSON_IETF', origin=''):
        """
        Changing the configuration on the destination network elements.
        Could provide a single attribute or multiple attributes.

        replace:
          - list of tuples where the first entry path provided as a string, and the second entry
            is a dictionary with the configuration to be configured

        The encoding argument may have the following values per gNMI specification:
          - JSON
          - BYTES
          - PROTO
          - ASCII
          - JSON_IETF

        origin: origin string for PATH
        """
        return self.gnmi_set(replace=replace, encoding=encoding, origin=origin)

    def gnmi_delete(self, delete=[], encoding='JSON_IETF', origin=''):
        """
        Changing the configuration on the destination network elements.
        Could provide a single attribute or multiple attributes.

        delete:
          - list of paths with the resources to delete. The format is the same as for get() request

        The encoding argument may have the following values per gNMI specification:
          - JSON
          - BYTES
          - PROTO
          - ASCII
          - JSON_IETF

        origin: origin string for PATH
        """
        return self.gnmi_set(delete=delete, encoding=encoding, origin=origin)

class SubscribeRpc(object):
    def __init__(self, iterator, req_iter, target=None, encoding=None, sub_type=None, path=None, origin=None,
                 timeout=None, dut=None):
        self.iterator = iterator
        self.exp_target = target
        self.si = req_iter
        self.encoding = encoding
        self.sub_type = sub_type
        self.path = path
        self.origin = origin
        self.timeout = timeout
        self.error = None  # gNMIError object
        self.dut = dut

    def __iter__(self):
        return self.iterator

    def __next__(self):
        return next(self.iterator)

    def next(self):
        return self.__next__()

    def cancel(self):
        log(f"Cancelling gNMI RPC call.dut={self.dut}")
        self.iterator.cancel()

    def poll(self):
        """
        Create a gNMI Poll trigger for gNMI Poll Subscription.
        :return:
        """
        if self.si:
            log(f"Sending Poll Trigger. dut={self.dut}")
            self.si.put(gnmi_pb2.SubscribeRequest(poll=gnmi_pb2.Poll()))
        else:
            log(f"Create POLL SubscribeRequest and try again.dut={self.dut}")

    def verify_error(self, exp_error=None):
        """
        Error Validation.
        Ex: SubscribeRpc.verify_error('INVALID_ARGUMENT')
        """
        try:
            self.next()
            log('No grpc error observed.', dut=self.dut)
            return False
        except Exception as err:
            if exp_error:
                return gNMIError(self.path, self.sub_type, err, dut=self.dut).verify_error(exp_error)
            else:
                return gNMIError(self.path, self.sub_type, err, dut=self.dut).is_error()

    def is_error(self):
        """
        Return True for not OK status.
        """
        try:
            self.next()
            log('No grpc error observed.')
            return False
        except Exception as err:
            return gNMIError(self.path, self.sub_type, err, dut=self.dut).is_error()
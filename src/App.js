import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import Stack from '@mui/material/Stack';
import { styled } from '@mui/material/styles';
import LoadingButton from '@mui/lab/LoadingButton';
import LoginIcon from '@mui/icons-material/Login';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import StopIcon from '@mui/icons-material/Stop';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import MenuItem from '@mui/material/MenuItem';
import theme from './theme';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import { Line } from 'react-chartjs-2';
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export const options = {
  responsive: true,
  plugins: {
    legend: {
      position: 'top',
    },
    title: {
      display: true,
      text: 'SONiC Interface Statistics',
    },
  },
};

const Item = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? '#1A2027' : '#fff',
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: 'center',
  color: theme.palette.text.secondary,
}));

function IntfOnChange(props) {
  const nodata = "No "+props.name+"s"
  
  function sortIntf (a, b) {
    const intf1 = a.split(/([0-9]+)/)[1]
    const intf2 = b.split(/([0-9]+)/)[1]
    //console.log(intf1, intf2)
    return intf1-intf2;
  }

  return (
    <TableContainer component={Paper}>
      <Table  aria-label="simple table">
        <TableHead>
          <TableRow>
            <TableCell>
              {/* <Chip label={props.name} color="error" variant="outlined" /> */}
              <Typography variant="h6" sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                {props.name}
              </Typography>
            </TableCell>
            <TableCell align="right">
              {/* <Chip label="Status" color="error" variant="outlined" /> */}
              <Typography variant="h6" sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                Status
              </Typography>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
        {Object.keys(props.rows).sort(sortIntf).map((k, i) => {
          let status = props.rows[k];
          return (
            <TableRow key={k} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
              <TableCell component="th" scope="row">
                <Typography variant="h6" component="div" sx={{ flexGrow: 2 }}>
                  {k}
                </Typography>
              </TableCell>
              <TableCell align="right">
              {status == "UP" ? (<Chip label="UP" color="success" />) : (<Chip label="DOWN" style={theme.palette.accent} />)}
              </TableCell>
            </TableRow>
          )
        })}
        {
          Object.keys(props.rows).length === 0 &&
          <Container sx={{padding: 2}}>
            <Chip label={nodata} color="error" variant="outlined" />
          </Container>
        }
        </TableBody>
    </Table>
  </TableContainer>
  );
}
function App() {
  const [socket, setSocket] = useState(null);
  const [sid, setSid] = useState(null);
  const [switchIp, setSwitchIp] = useState("10.193.93.70");
  const [sampleEth, setSampleEth] = useState("Ethernet0");
  const [sampleInterval, setSampleInterval] = useState(30);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("broadcom");
  const [gConnect, setGConnect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState(2);
  const [intfEthernetRows, setIntfEthernetRows] = useState({});
  const [intfEthRows, setIntfEthRows] = useState({});
  const [intfVlanRows, setIntfVlanRows] = useState({});
  const [intfPortChannelRows, setIntfPortChannelRows] = useState({});
  const [intfStatusRpcStatus, SetIntfStatusRpcStatus] = useState(0);
  const [intfStatusSampleRpcStatus, SetIntfStatusSampleRpcStatus] = useState(0);
  const [showSnack, setshowSnack] = useState(false);
  const [snackMsg, setSnackMsg] = useState("");
  const [vlans, setVlans] = useState([])
  const [vlanId, setVlanId] = useState(10)
  const [vlanStr, setVlanStr] = useState(10)
  const [phyPort, setPhyPort] = useState("Ethernet11")
  const [mtu, setMtu] = useState(1312)
  const [vlanIds, setVlanIds] = useState([])
  const inPktsData = {
    labels: [],
    datasets: [
      {
        label: 'InPkts',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ]
  }
  const [inPktsChartData, setInPktsChartData ] = useState(inPktsData);
  
  const outPktsData = {
    labels: [],
    datasets: [
      {
        label: 'OutPkts',
        data: [],
        borderColor: 'rgb(0, 71, 179)',
        backgroundColor: 'rgba(0, 71, 179, 0.5)',
      },
    ]
  }
  const [outPktsChartData, setOutPktsChartData ] = useState(outPktsData);

  const inUniPktsData = {
    labels: [],
    datasets: [
      {
        label: 'InUniCastPkts',
        data: [],
        borderColor: 'rgb(153, 102, 51)',
        backgroundColor: 'rgba(153, 102, 51, 0.5)',
      },
    ]
  }
  const [inUniPktsChartData, setInUniPktsChartData ] = useState(inUniPktsData);

  const OutUniPktsData = {
    labels: [],
    datasets: [
      {
        label: 'OutUniCastPkts',
        data: [],
        borderColor: 'rgb(0, 153, 51)',
        backgroundColor: 'rgba(0, 153, 51, 0.5)',
      },
    ],
  }
  const [outUniPktsChartData, setOutUniPktsChartData ] = useState(OutUniPktsData);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);
    newSocket.on("connect", () => {
      console.log("Session Connected")
      console.log(newSocket.id);
      setSid(newSocket.id)
    });
    newSocket.on("disconnect", () => {
      console.log("Session disconnected")
      setSid(null)
      setGConnect(null)
      SetIntfStatusRpcStatus(0);
      SetIntfStatusSampleRpcStatus(0);
    });
    newSocket.on("interface_on_change", (msg) => {
      console.log(msg)
      let key = Object.keys(msg)[0].toLowerCase();
      if (key.startsWith("ethernet")) {
        setIntfEthernetRows(vals => ({
          ...vals,
          ...msg
        }));
      } else if (key.startsWith("eth")) {
          setIntfEthRows(vals => ({
            ...vals,
            ...msg
          }));
      } else if (key.startsWith("vlan")) {
          setIntfVlanRows(vals => ({
            ...vals,
            ...msg
          }));
      } else if (key.startsWith("portchannel")) {
          setIntfPortChannelRows(vals => ({
            ...vals,
            ...msg
          }));
      } else {
          console.log("Not interested in ", msg);
      }
    });

    newSocket.on("interface_sample", (msg) => {
      console.log("Received sample notification ==> ", msg);
      
      setInPktsChartData((prevState) => {
        let newLabels = [
          ...prevState.labels.slice(-9),
          new Date().toLocaleString().substr(10, 7)
        ]
        let inPData = [
          ...prevState.datasets
        ]
        
        console.log("**in-pkts - Labels**", newLabels);

        //Set InPkts
        inPData[0].data.push(msg['in-pkts']);
        inPData[0].data = inPData[0].data.slice(-10);
        console.log("**in-pkts**", msg['in-pkts'], inPData[0].data);

        return {...prevState, labels:newLabels, datasets:inPData}
      
      });

      setOutPktsChartData((prevState) => {
        let newOutLabels = [
          ...prevState.labels.slice(-9),
          new Date().toLocaleString().substr(10, 7)
        ]
        let outPData = [
          ...prevState.datasets
        ]
        
        console.log("**out-pkts - Labels**", newOutLabels);
        
        //Set OutPkts
        outPData[0].data.push(msg['out-pkts']);
        outPData[0].data = outPData[0].data.slice(-10);
        console.log("**out-pkts**", msg['out-pkts'], outPData[0].data);
        

        return {...prevState, labels:newOutLabels, datasets:outPData}
      
      });

      setInUniPktsChartData((prevState) => {
        let newInUniLabels = [
          ...prevState.labels.slice(-9),
          new Date().toLocaleString().substr(10, 7)
        ]
        let inUData = [
          ...prevState.datasets
        ]
        
        console.log("**in-unicast-pkts - Labels**", newInUniLabels);
        
        //Set InUniPkts
        inUData[0].data.push(msg['in-unicast-pkts']);
        inUData[0].data = inUData[0].data.slice(-10);
        console.log("**in-unicast-pkts**", msg['in-unicast-pkts'], inUData[0].data);

        return {...prevState, labels:newInUniLabels, datasets:inUData}
      
      });

      setOutUniPktsChartData((prevState) => {
        let newOLabels = [
          ...prevState.labels.slice(-9),
          new Date().toLocaleString().substr(10, 7)
        ]
        let OUData = [
          ...prevState.datasets
        ]
        
        console.log("**out-unicast-pkts - Labels**", newOLabels);

        //Set OutUniPkts
        OUData[0].data.push(msg['out-unicast-pkts']);
        OUData[0].data = OUData[0].data.slice(-10);
        console.log("**out-unicast-pkts**", msg['out-unicast-pkts'], OUData[0].data);

        return {...prevState, labels:newOLabels, datasets:OUData}
      
      });

    });

    return () => newSocket.close();
  }, [setSocket]);

  const rest_stats_data = () => {
    setIntfEthRows({});
    setIntfEthernetRows({});
    setIntfVlanRows({});
    setIntfPortChannelRows({});
    SetIntfStatusRpcStatus(0);
    SetIntfStatusSampleRpcStatus(0);
    reset_sample_data();
  }

  const reset_sample_data = () => {
    SetIntfStatusSampleRpcStatus(0);
    setInPktsChartData(inPktsData);
    setOutPktsChartData(outPktsData);
    setInUniPktsChartData(inUniPktsData);
    setOutUniPktsChartData(OutUniPktsData);
  }
  const gnmi_connect = (event) => {
    event.preventDefault();
    setLoading(true);
    rest_stats_data();
    setVlans([]);
    axios.post("/connect/"+sid+"/"+switchIp+"/"+username+"/"+password)
    .then(function (response) {
      console.log(response);
      setGConnect(true)
      setLoading(false);
      setSnackMsg("Login Successful")
      setshowSnack(true);
      get_vlans();
      reset_sample_data();
    })
    .catch(function (error) {
      console.log(error);
      setSnackMsg("Login Failed - "+ error);
      setGConnect(false)
      setLoading(false);
    });
  }

  const gnmi_disconnect = () => {
    axios.post("/disconnect/"+sid+"/"+switchIp)
    .then(function (response) {
      console.log(response);
      setGConnect(false)
      setIntfEthRows({});
      setIntfEthernetRows({});
      setIntfVlanRows({});
      setIntfPortChannelRows({});
      SetIntfStatusRpcStatus(0);
      intfStatusSampleRpcStatus(0);
      rest_stats_data();
      setVlans([]);
    })
    .catch(function (error) {
      console.log(error);
      setIntfEthRows({});
      setIntfEthernetRows({});
      setIntfVlanRows({});
      setIntfPortChannelRows({});
      SetIntfStatusRpcStatus(0);
      intfStatusSampleRpcStatus(0);
      rest_stats_data();
    });
    rest_stats_data();
  }

  const delete_vlan = () => {
    axios.delete("/delete_vlan/"+sid+"/"+"Vlan"+vlanStr)
    .then(function (response) {
      console.log(response);
      setSnackMsg("VLAN "+vlanStr+" Deleted!");
      setshowSnack(true);
      const newArr = [...vlanIds];
      newArr.splice(newArr.findIndex(item => item === vlanStr), 1)
      setVlanIds(newArr);
    })
    .catch(function (error) {
      console.log(error.response);
      setSnackMsg("VLAN "+vlanStr+" Deletion failed - " + error.response.data.message);
      setshowSnack(true);
    });
  }

  const create_vlan = () => {
    axios.post("/create_vlan/"+sid+"/"+"Vlan"+vlanStr)
    .then(function (response) {
      console.log(response);
      setSnackMsg("VLAN "+vlanStr+" Created!");
      setshowSnack(true);
      setVlanIds((prev) => {
        return [
          ...prev,
          vlanStr
        ]
      });
    })
    .catch(function (error) {
      console.log(error.response);
      setSnackMsg("VLAN "+vlanStr+" Creation failed - " + error.response.data.message);
      setshowSnack(true);
    });
  }

  const vlan_membership = () => {
    axios.post("/vlan_membership/"+sid+"/"+vlanId+"/"+phyPort)
    .then(function (response) {
      console.log(response);
      setSnackMsg("Assigned VLAN "+vlanId+" a Membership!");
      setshowSnack(true);
    })
    .catch(function (error) {
      console.log(error.response);
      setSnackMsg("VLAN "+vlanId+" Member Assignment failed - " + error.response.data.message);
      setshowSnack(true);
    });
  }

  const del_vlan_membership = () => {
    axios.delete("/del_vlan_membership/"+sid+"/"+phyPort)
    .then(function (response) {
      console.log(response);
      setSnackMsg("Deleted VLAN "+vlanId+"'s Membership!");
      setshowSnack(true);
    })
    .catch(function (error) {
      console.log(error.response);
      setSnackMsg("VLAN "+vlanId+" Member deletion failed - " + error.response.data.message);
      setshowSnack(true);
    });
  }

  const del_vlan_mtu = () => {
    axios.delete("/del_vlan_mtu/"+sid+"/"+"Vlan"+vlanId)
    .then(function (response) {
      console.log(response);
      setSnackMsg("Deletion of VLAN "+vlanId+"'s MTU passed! "+mtu);
      setshowSnack(true);
    })
    .catch(function (error) {
      console.log(error);
      setSnackMsg("Deletion of VLAN "+vlanId+"'s MTU failed - " + error.response.data.message);
      setshowSnack(true);
    });
  }

  const vlan_mtu = () => {
    axios.post("/vlan_mtu/"+sid+"/"+"Vlan"+vlanId+"/"+mtu)
    .then(function (response) {
      console.log(response);
      setSnackMsg("Assigned VLAN "+vlanId+" a MTU! "+mtu);
      setshowSnack(true);
    })
    .catch(function (error) {
      console.log(error);
      setSnackMsg("VLAN "+vlanId+" MTU Assignment failed - " + error.response.data.message);
      setshowSnack(true);
    });
  }

  const setIp = (event) => {
    setSwitchIp(event.target.value);
  }

  const setEth = (event) => {
    setSampleEth(event.target.value);
  }

  const setSampleInt = (event) => {
    setSampleInterval(event.target.value);
  }

  const setName = (event) => {
    setUsername(event.target.value);
  }

  const setPass = (event) => {
    setPassword(event.target.value);
  }

  const popVlanId = (event) => {
    setVlanId(event.target.value);
  }

  const popVlanStr = (event) => {
    setVlanStr(event.target.value);
  }

  const popPhyPort = (event) => {
    setPhyPort(event.target.value);
  }

  const popMtu = (event) => {
    setMtu(event.target.value);
  }

  const get_vlans = () => {
    axios.get("/"+sid+"/get_vlans", {
      onDownloadProgress: (progressEvent) => {
        const dataChunk = progressEvent.currentTarget.response;
        console.log(dataChunk)
      }
    })
    .then(function (response) {
      console.log(response);
      console.log("VLANS-LIST ", response["data"]);
      setVlans(response["data"]["data"]);
      setSnackMsg("Vlans Retrieved");
      setshowSnack(true);
    })
    .catch(function (error) {
      console.log(error);
      if (error.response.status == 404) {
        setVlans([]);
        setSnackMsg("No VLANs to show");
        setshowSnack(true);
      } else {
        setSnackMsg("Show VLANs failed" + error);
        setshowSnack(true);
      }
    });
  }

  const start_interface_rpc = () => {
    axios.get("/interface_onchange/"+sid+"/start", {
      onDownloadProgress: (progressEvent) => {
        const dataChunk = progressEvent.currentTarget.response;
        console.log(dataChunk)
      }
    })
    .then(function (response) {
      console.log(response);
    })
    .catch(function (error) {
      console.log(error);
    });
    SetIntfStatusRpcStatus(1);
  }

  const start_interface_sample_rpc = () => {
    axios.get("/interface_sample/"+sid+"/"+sampleEth+"/"+sampleInterval+"/start", {
      onDownloadProgress: (progressEvent) => {
        const dataChunk = progressEvent.currentTarget.response;
        console.log(dataChunk)
      }
    })
    .then(function (response) {
      console.log(response);
    })
    .catch(function (error) {
      console.log(error);
    });
    SetIntfStatusSampleRpcStatus(1);
  }

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  const stop_interface_sample_rpc = (event) => {
    axios.get("/interface_sample/"+sid+"/"+sampleEth+"/"+sampleInterval+"/stop", {
      onDownloadProgress: (progressEvent) => {
        const dataChunk = progressEvent.currentTarget.response;
        console.log(dataChunk)
      }
    })
    .then(function (response) {
      console.log(response);
      reset_sample_data();
    })
    .catch(function (error) {
      console.log(error);
    });
  };

  const stop_interface_status_rpc = (event) => {
    axios.get("/interface_onchange/"+sid+"/stop", {
      onDownloadProgress: (progressEvent) => {
        const dataChunk = progressEvent.currentTarget.response;
        console.log(dataChunk)
      }
    })
    .then(function (response) {
      console.log(response);
      SetIntfStatusRpcStatus(0);
    })
    .catch(function (error) {
      console.log(error);
    });
    setIntfEthRows({});
    setIntfEthernetRows({});
    setIntfVlanRows({});
    setIntfPortChannelRows({});
  };

  function a11yProps(index) {
    return {
      id: `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    };
  }

  const snackClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setshowSnack(false);
  };

  return (
    <div className="App">
      <Snackbar
        open={showSnack}
        autoHideDuration={2000}
        onClose={snackClose}
        message={snackMsg}
      />
    <Box sx={{ display: 'flex' }}>
        <AppBar position="static" color="error">
          <Toolbar color="error">
            <Typography variant="h3" color="dark" component="div" sx={{ flexGrow: 1 }}>
                BROADCOM
            </Typography>
            { gConnect ? (
              <div>
                <Typography variant="h8" component="toolbar" sx={{ flexGrow: 1 }}>Connected to {switchIp}</Typography>
                <Button size="large" variant="primary"  onClick={gnmi_disconnect} sx={{ flexGrow: 0.1 }}>
                  <Typography variant="h6" component="button" sx={{ flexGrow: 1 }}>Disconnect</Typography>
                </Button>
              </div>
            ): (<div></div>)
            }
          </Toolbar>
        </AppBar>
      </Box>
      { sid ? (
        <div>
        { gConnect ? (
          <div>
            <Box sx={{ width: '100%', paddingTop: 2 }}>
            
            <Container>
              <Box sx={{ borderBottom: 1, borderColor: 'divider',
            flexgrow:1 }}>
                <Tabs indicatorColor="secondary" textColor="secondary" value={value} onChange={handleChange} aria-label="basic tabs example">
                  <Tab label="GET/SET" {...a11yProps(0)} />
                  <Tab label="Subscribe Onchange" {...a11yProps(1)} />
                  <Tab label="Subscribe Sample" {...a11yProps(2)} />
                </Tabs>
              </Box>
            </Container>
            <Container>
              {
                value == 0 ? (<Box sx={{ width: '100%', paddingTop: 2 }}>
                  <Grid container>
                    <Grid item xs={6}>
                      <Grid container>
                        <Grid item sx={{width: '100%'}}>
                          <Card sx={{ paddingTop: 2, width: '100%'  }}>
                            <CardActions sx={{ paddingTop: 5  }}>
                              <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                VLAN Create
                              </Typography>
                            </CardActions>
                            <CardActions sx={{ paddingTop: 5  }}>
                              <TextField color="error" id="outlined-basic" label="Vlan Name" value={vlanStr} onChange={popVlanStr} variant="outlined"/>
                            </CardActions>
                            <CardContent>
                              <Grid container spacing={2}>
                                <Grid item>
                                  <Button color="error" disabled={vlanStr.length === 0} variant="contained" onClick={create_vlan}>Create</Button>
                                </Grid>
                                <Grid item>
                                  <Button color="error" disabled={vlanStr.length === 0} variant="contained" onClick={delete_vlan}>Delete</Button>
                                </Grid>
                              </Grid>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item sx={{ paddingTop: 2, width: '100%' }}>
                          <Card>
                            <CardActions sx={{ paddingTop: 5  }}>
                              <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                Assign MTU
                              </Typography>
                            </CardActions>
                            <CardActions sx={{ paddingTop: 5  }}>
                              <TextField color="error" id="outlined-basic" label="Vlan ID" value={vlanId} onChange={popVlanId} variant="outlined"/>
                              {/* <Select
                                value={vlanId}
                                label="Age"
                                color="error"
                                autoWidth
                                displayEmpty
                                onChange={popVlanId}>
                                  {
                                    vlanIds.map(
                                      (id) => (
                                        <MenuItem value={id} key={id}>{id}</MenuItem>
                                      )
                                    )
                                  }
                              </Select> */}
                              <TextField color="error" id="outlined-basic" label="MTU" value={mtu} onChange={popMtu} variant="outlined"/>
                            </CardActions>
                            <CardContent>
                              <Grid container spacing={2}>
                                <Grid item>
                                  <Button  color="error" disabled={vlanId.length === 0 || mtu.length === 0} variant="contained" onClick={vlan_mtu}>Assign MTU</Button>
                                </Grid>
                                <Grid item>
                                  <Button  color="error" disabled={vlanId.length === 0} variant="contained" onClick={del_vlan_mtu}>Delete MTU</Button>
                                </Grid>
                              </Grid>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item sx={{ paddingTop: 2, width: '100%'  }}>
                          <Card sx={{ paddingTop: 2  }}>
                            <CardActions sx={{ paddingTop: 5  }}>
                              <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                VLAN Membership
                              </Typography>
                            </CardActions>
                            <CardActions sx={{ paddingTop: 5  }}>
                              <TextField color="error" id="outlined-basic" label="Vlan ID" value={vlanId} onChange={popVlanId} variant="outlined"/>
                              <TextField color="error" id="outlined-basic" label="Port" value={phyPort} onChange={popPhyPort} variant="outlined"/>
                            </CardActions>
                            <CardContent>
                              <Grid container spacing={2}>
                                <Grid item>
                                  <Button  disabled={vlanId.length === 0 || phyPort.length === 0} color="error" variant="contained" onClick={vlan_membership}>Assign Member</Button>
                                </Grid>
                                <Grid item>
                                  <Button  disabled={phyPort.length === 0} color="error" variant="contained" onClick={del_vlan_membership}>Delete Member</Button>
                                </Grid>
                              </Grid>
                            </CardContent>
                          </Card>
                        </Grid>
                      </Grid>
                    </Grid>
                    <Grid item xs={6} sx={{paddingLeft: 2}}>
                      <Card >
                          <Item>
                            <CardActions>
                              <Typography variant="h5" sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                Show VLANs
                              </Typography>
                              <Button color="error" variant="contained" onClick={get_vlans}>Show</Button>
                            </CardActions>
                            <CardContent>
                            <Paper sx={{ width: '100%', overflow: 'hidden' }}>
                              <TableContainer component={Paper}>
                                  <Table  stickyHeader aria-label="simple table">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>
                                          <Typography variant="h6" sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                            Name
                                          </Typography>
                                        </TableCell>
                                        <TableCell >
                                          <Typography variant="h6" sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                            Members
                                          </Typography>
                                        </TableCell>
                                        <TableCell >
                                          <Typography variant="h6" sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                            MTU
                                          </Typography>
                                        </TableCell>
                                      </TableRow>
                                    </TableHead>
              
                                      {vlans.map((row) => {
                                        return(
                                          <TableBody>
                                            <TableRow key={row.vlanid} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                              <TableCell>
                                                <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                                  {row.name}
                                                </Typography>
                                              </TableCell>
                                              <TableCell>
                                                <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                                  {row.members}
                                                </Typography>
                                              </TableCell>
                                              <TableCell>
                                                <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                                  {row.mtu}
                                                </Typography>
                                              </TableCell>
                                            </TableRow>
                                            </TableBody>
                                          )
                                        })
                                      }
                                    
                                    </Table>
                                    </TableContainer>
                                  </Paper>
                            </CardContent>
                          </Item>
                        </Card>
                    </Grid>
                    <Grid item xs={6} sx={{ paddingTop:  4 }}>
                    </Grid>
                    <Grid item xs={6} sx={{ paddingTop:  4 }}></Grid>
                    <Grid item xs={6} sx={{ paddingTop:  4 }}>
                    </Grid>
                  </Grid>
                </Box>):(<div></div>)
              }
            </Container>
            <Container>
            {
              value == 1 ? (
                <Box sx={{ width: '100%', paddingTop: 2 }}>
                  <Container>
                    <Card sx={{ paddingTop: 2  }}>
                      <CardActions>
                        <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                          Interface Status
                        </Typography>
                        <Button color="error" size="small" disabled={intfStatusRpcStatus === 1} onClick={start_interface_rpc} startIcon={<PlayArrowIcon/>}>start</Button>
                        <Button color="error" size="small" disabled={intfStatusRpcStatus === 0} onClick={stop_interface_status_rpc} startIcon={<StopIcon/>}>stop</Button>
                      </CardActions>
                      <Grid container>
                        <Grid item xs={4}>
                          <CardContent>
                            <Item><IntfOnChange name="Ethernet Interface" rows={intfEthernetRows}/></Item>
                          </CardContent>
                        </Grid>
                        <Grid item xs={4}>
                          <CardContent>
                            <Item><IntfOnChange name="Vlan Interface" rows={intfVlanRows}/></Item>
                          </CardContent>
                        </Grid>
                        <Grid item xs={4}>
                          <CardContent>
                            <Item><IntfOnChange name="eth Interface" rows={intfEthRows}/></Item>
                          </CardContent>
                        </Grid>
                        <Grid item xs={4}>
                          <CardContent>
                            <Item><IntfOnChange name="PortChannel Interface" rows={intfPortChannelRows}/></Item>
                          </CardContent>
                        </Grid>
                      </Grid>
                    </Card>
                  </Container>
                </Box>

            ) : (
              <div></div>
              )
            }
            </Container>

            <Container>
            {
              value == 2 ? (
                <Box sx={{ width: '100%', paddingTop: 2 }}>
                  <Card sx={{ paddingTop: 2  }}>
                  <CardActions>
                      <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                        Interface Statistics
                      </Typography>
                      <TextField color="error" id="outlined-basic" label="Ethernet" value={sampleEth} onChange={setEth} variant="outlined"/>
                      {/* <TextField color="error" id="outlined-basic" label="Interval" value={sampleInterval} onChange={setSampleInt} variant="outlined"/> */}
                      <Button color="error" size="small" disabled={intfStatusSampleRpcStatus === 1} onClick={start_interface_sample_rpc} startIcon={<PlayArrowIcon/>}>start</Button>
                      <Button color="error" size="small" disabled={intfStatusSampleRpcStatus === 0} onClick={stop_interface_sample_rpc} startIcon={<StopIcon/>}>stop</Button>
                    </CardActions>
                    <CardContent>
                      <div className="p-3 m-4 border border-muted">
                        <Line data={inPktsChartData} />
                      </div>
                    </CardContent>
                    <CardContent>
                      <div className="p-3 m-4 border border-muted">
                        <Line data={outPktsChartData} />
                      </div>
                    </CardContent>
                    <CardContent>
                      <div className="p-3 m-4 border border-muted">
                        <Line data={inUniPktsChartData} />
                      </div>
                    </CardContent>
                    <CardContent>
                      <div className="p-3 m-4 border border-muted">
                        <Line data={outUniPktsChartData} />
                      </div>
                    </CardContent>
                  </Card>
                </Box>
            ) : (
              <div></div>
              )
            }
            </Container>

          </Box>
          </div>
        ) : (
          <div>
            <Box
              component="form"
              sx={{
                paddingTop: 20,
              }}
              noValidate
              autoComplete="off"
            >
              <Container maxWidth="sm">
                <Paper  square elevation={6}>
                  <Stack>
                    <Item>
                      <Typography variant="h3" component="div" sx={{ flexGrow: 2 }}>
                          gNMI Web client
                      </Typography>
                    </Item>
                    <Item><TextField color="error" id="outlined-basic" label="Switch IP" value={switchIp} onChange={setIp} variant="outlined"/></Item>
                    <Item><TextField color="error" id="outlined-basic" label="Mgmt Username" value={username} onChange={setName} variant="outlined"/></Item>
                    <Item><TextField color="error" id="outlined-basic" label="Mgmt Password" type='password' value={password} onChange={setPass} variant="outlined"/></Item>
                    <Item><LoadingButton color="error" startIcon={<LoginIcon />} loading={loading} size="large" variant="contained" onClick={gnmi_connect}>Connect</LoadingButton></Item>
                  </Stack>
                </Paper>
              </Container>
            </Box>
          </div>
        ) }
          </div>
      ) : (
        <div></div>
      )}
    </div>
  );
}

export default App;

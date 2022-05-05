import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Paper from '@mui/material/Paper';
import Container from '@mui/material/Container';
import broadcom_logo from './broadcom.png';
import Toolbar from '@mui/material/Toolbar';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import Stack from '@mui/material/Stack';
import { styled } from '@mui/material/styles';
import LoadingButton from '@mui/lab/LoadingButton';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
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
import {
  Resizable,
  Charts,
  ChartContainer,
  ChartRow,
  YAxis,
  styler,
  LineChart,
  BarChart,
  ScatterChart
} from "react-timeseries-charts";
import { TimeSeries, Index } from "pondjs";
import Snackbar from '@mui/material/Snackbar';
import { fontSize } from '@mui/system';
import MenuItem from '@mui/material/MenuItem';

const style = styler([
  {
    key: "precip",
    color: "#260105",
    selected: "#2CB1CF",
    fontSize: 30
  }
]);

const Item = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.mode === 'dark' ? '#1A2027' : '#fff',
  ...theme.typography.body2,
  padding: theme.spacing(1),
  textAlign: 'center',
  color: theme.palette.text.secondary,
}));

function App() {
  const [socket, setSocket] = useState(null);
  const [sid, setSid] = useState(null);
  const [switchIp, setSwitchIp] = useState("10.59.135.173");
  const [sampleEth, setSampleEth] = useState("Ethernet11");
  const [sampleInterval, setSampleInterval] = useState(30);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("broadcom");
  const [gConnect, setGConnect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState(2);
  const [intfRows, setIntfRows] = useState({});
  const [intfStatusRpcStatus, SetIntfStatusRpcStatus] = useState(0);
  const [intfStatusSampleRpcStatus, SetIntfStatusSampleRpcStatus] = useState(0);
  const [min, setMin] = useState(500);
  const [max, setMax] = useState(1000);
  const [showSnack, setshowSnack] = useState(false);
  const [snackMsg, setSnackMsg] = useState("");
  const [vlans, setVlans] = useState([])
  const [vlanId, setVlanId] = useState(10)
  const [vlanStr, setVlanStr] = useState(10)
  const [phyPort, setPhyPort] = useState("Ethernet11")
  const [mtu, setMtu] = useState(1312)
  const [vlanIds, setVlanIds] = useState([])

  //In-Pkts
  const inpktsData = {name: "inpkts",
    columns: ["index", "precip"],
    points: [
      [Index.getIndexString("20s", new Date()), 0 ],
      [Index.getIndexString("20s", new Date()), 0 ],
    ]
  }
  const [intfSampleInPktsData, SetintfSampleInPktsData] = useState(inpktsData);
  var inPktsSeries = new TimeSeries(intfSampleInPktsData);

  //Out-Pkts
  const outPktsData = {name: "outpkts",
    columns: ["index", "precip"],
    points: [
      [Index.getIndexString("20s", new Date()), 0 ],
      [Index.getIndexString("20s", new Date()), 0 ],
    ]
  }
  const [intfSampleOutPktsData, SetintfSampleOutPktsData] = useState(outPktsData);
  var outPktsSeries = new TimeSeries(intfSampleOutPktsData);

  function sortIntf (a, b) {
    const intf1 = a.split(/([0-9]+)/)[1]
    const intf2 = b.split(/([0-9]+)/)[1]
    console.log(intf1, intf2)
    return intf1-intf2;
  }

  //In-Unicast-Pkts
  const inUniPktsData = {name: "inunipkts",
    columns: ["index", "precip"],
    points: [
      [Index.getIndexString("20s", new Date()), 0 ],
      [Index.getIndexString("20s", new Date()), 0 ],
    ]
  }
  const [intfSampleInUnicastPktsData, SetintfSampleInUnicastPktsData] = useState(inUniPktsData);
  var inUnicastPktsSeries = new TimeSeries(intfSampleInUnicastPktsData);

  //Out-Unicast-Pkts
  const outUniPktsData = {name: "outunipkts",
    columns: ["index", "precip"],
    points: [
      [Index.getIndexString("20s", new Date()), 0 ],
      [Index.getIndexString("20s", new Date()), 0 ],
    ]
  }
  const [intfSampleOutUnicastPktsData, SetintfSampleOutUnicastPktsData] = useState(outUniPktsData);
  var outUnicastPktsSeries = new TimeSeries(intfSampleOutUnicastPktsData);

  const set_val = () => {
    SetintfSampleInPktsData((prevState) => {
      let updatedVals = {
        points: [
          ...prevState.points,
          [Index.getIndexString("20s", new Date()), 4000]
        ]
      }
      return {...prevState, ...updatedVals}
    });
    console.log(intfSampleInPktsData);
  }

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
      setIntfRows(vals => ({
        ...vals,
        ...msg
      }));
    });

    newSocket.on("interface_sample", (msg) => {
      //console.log(msg)
      var stats_name = Object.keys(msg)[0]
      var stats_val = msg[stats_name]
      if (stats_val > max) {
        setMax(stats_val)
      }
      if (stats_val < min) {
        setMin(stats_val)
      }
      if (stats_name == "in-pkts") {
        SetintfSampleInPktsData((prevState) => {
          let updatedVals = [
            ...prevState.points,
              [Index.getIndexString("20s", new Date()), stats_val]
            ]
          console.log("stats_name", updatedVals)
          return {...prevState, points:updatedVals}
        });
        console.log(stats_name, stats_val, intfSampleInPktsData);
      } else if (stats_name == "out-pkts") {
          SetintfSampleOutPktsData((prevState) => {
            let updatedVals = [
              ...prevState.points,
                [Index.getIndexString("20s", new Date()), stats_val]
              ]
            return {...prevState, points:updatedVals}
          });
          console.log(intfSampleOutPktsData);
        } else if (stats_name == "in-unicast-pkts") {
            SetintfSampleInUnicastPktsData((prevState) => {
              let updatedVals = [
                ...prevState.points,
                  [Index.getIndexString("20s", new Date()), stats_val]
                ]
              return {...prevState, points:updatedVals}
            });
            console.log(intfSampleInUnicastPktsData);
        } else if (stats_name == "out-unicast-pkts") {
            SetintfSampleOutUnicastPktsData((prevState) => {
              let updatedVals = [
                ...prevState.points,
                  [Index.getIndexString("20s", new Date()), stats_val]
                ]
              return {...prevState, points:updatedVals}
            });
            console.log(intfSampleOutUnicastPktsData);
        } else {
        //console.log("Not interested in this data");
      }
    });

    return () => newSocket.close();
  }, [setSocket]);

  const rest_stats_data = () => {
    SetintfSampleInPktsData(inpktsData);
    SetintfSampleOutPktsData(outPktsData);
    SetintfSampleInUnicastPktsData(inUniPktsData);
    SetintfSampleOutUnicastPktsData(outPktsData);
    setIntfRows({})
    SetIntfStatusRpcStatus(0);
    SetIntfStatusSampleRpcStatus(0);
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
      setIntfRows({});
      SetIntfStatusRpcStatus(0);
      intfStatusSampleRpcStatus(0);
      rest_stats_data();
      setVlans([]);
    })
    .catch(function (error) {
      console.log(error);
      setIntfRows({});
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
      SetIntfStatusSampleRpcStatus(0);
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
    setIntfRows({});
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
            <Button size="large" variant="primary"  onClick={gnmi_disconnect} sx={{ flexGrow: 0.1 }}>
              <Typography variant="h6" component="button" sx={{ flexGrow: 1 }}>Disconnect</Typography></Button>
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
                                              {/* <TableCell>
                                                <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                                                  {row.autostate}
                                                </Typography>
                                              </TableCell> */}
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
                  <Card sx={{ paddingTop: 2  }}>
                  <CardActions>
                      <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                        Interface Status
                      </Typography>
                      <Button color="error" size="small" disabled={intfStatusRpcStatus === 1} onClick={start_interface_rpc} startIcon={<PlayArrowIcon/>}>start</Button>
                      <Button color="error" size="small" disabled={intfStatusRpcStatus === 0} onClick={stop_interface_status_rpc} startIcon={<StopIcon/>}>stop</Button>
                    </CardActions>
                    <CardContent>
                      {/* {Object.keys(intfRows).sort().map((k, i) => {
                          let status = intfRows[k];
                          let color = "error"
                          if (status == "UP") {
                            color = "success"
                          }
                          return (
                              <Grid item>
                                <Chip label={k} color={color} variant="contained" />
                              </Grid>
                          )
                      })
                      } */}
                    {/* <TableContainer component={Paper}>
                      <Table  aria-label="simple table">
                        <TableHead>
                          <TableRow>
                            <TableCell>
                              <Chip label="Interface" color="primary" variant="outlined" />
                            </TableCell>
                            <TableCell align="right">
                              <Chip label="Status" color="primary" variant="outlined" />
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody> */}
                          <Grid container spacing={2}>
                        {Object.keys(intfRows).sort(sortIntf).map((k, i) => {
                          let status = intfRows[k];
                          return(
                            <Grid item xs={2}>
                              <Item>
                              {status == "UP" ? (<Chip label={k} color="success" />) : (<Chip label={k} color="error" />)}
                              </Item>
                            </Grid>
                          )
                          // return (
                          //   <TableRow key={k} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                          //     <TableCell component="th" scope="row">
                          //       <Typography variant="h6" component="div" sx={{ flexGrow: 2 }}>
                          //         {k}
                          //       </Typography>
                          //     </TableCell>
                          //     <TableCell align="right">
                          //     {status == "UP" ? (<Chip label="UP" color="success" />) : (<Chip label="DOWN" color="error" />)}
                          //     </TableCell>
                          //   </TableRow>
                          // )
                        })}
                        </Grid>
                        {/* </TableBody>
                      </Table>
                    </TableContainer> */}
                    </CardContent>
                  </Card>
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
                        <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                          In-pkts
                        </Typography>
                        <Resizable>
                          <ChartContainer timeRange={inPktsSeries.range()}>
                          <ChartRow height="250">
                              <YAxis
                                id="pkts"
                                label="pkts"
                                // min={min}
                                // max={max}
                                type="linear"
                              />
                              <Charts>
                                <LineChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={inPktsSeries}
                                  minBarHeight={1}
                                />
                                <ScatterChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={inPktsSeries}
                                />
                              </Charts>
                            </ChartRow>
                          </ChartContainer>
                        </Resizable>
                      </div>
                    </CardContent>
                    <CardContent>
                      <div className="p-3 m-4 border border-muted">
                      <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                          Out-pkts
                        </Typography>
                        <Resizable>
                          <ChartContainer timeRange={outPktsSeries.range()}>
                            <ChartRow height="250">
                              <YAxis
                                id="pkts"
                                label="pkts"
                                min={min}
                                max={max}
                                type="linear"
                              />
                              <Charts>
                                <LineChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={outPktsSeries}
                                  minBarHeight={1}
                                />
                                <ScatterChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={outPktsSeries}
                                />
                              </Charts>
                            </ChartRow>
                          </ChartContainer>
                        </Resizable>
                      </div>
                    </CardContent>
                    <CardContent>
                      <div className="p-3 m-4 border border-muted">
                      <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                          In-Unicast-Pkts
                        </Typography>
                        <Resizable>
                          <ChartContainer timeRange={inUnicastPktsSeries.range()}>
                            <ChartRow height="250">
                              <YAxis
                                id="pkts"
                                label="pkts"
                                min={min}
                                max={max}
                                type="linear"
                              />
                              <Charts>
                                <LineChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={inUnicastPktsSeries}
                                  minBarHeight={1}
                                />
                                <ScatterChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={inUnicastPktsSeries}
                                />
                              </Charts>
                            </ChartRow>
                          </ChartContainer>
                        </Resizable>
                      </div>
                    </CardContent>
                    <CardContent>
                      <div className="p-3 m-4 border border-muted">
                      <Typography sx={{ flexGrow: 1}} color="text.secondary" gutterBottom>
                          Out-Unicast-Pkts
                        </Typography>
                        <Resizable>
                          <ChartContainer timeRange={outUnicastPktsSeries.range()}>
                            <ChartRow height="250">
                              <YAxis
                                id="pkts"
                                label="pkts"
                                min={min}
                                max={max}
                                type="linear"
                              />
                              <Charts>
                                <LineChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={outUnicastPktsSeries}
                                  minBarHeight={1}
                                />
                                <ScatterChart
                                  axis="pkts"
                                  style={style}
                                  spacing={1}
                                  columns={["precip"]}
                                  series={outUnicastPktsSeries}
                                />
                              </Charts>
                            </ChartRow>
                          </ChartContainer>
                        </Resizable>
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

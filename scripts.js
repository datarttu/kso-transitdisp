const queryStringInURL = window.location.search;
console.log(queryStringInURL);
const urlParams = new URLSearchParams(queryStringInURL);
const stopListString = urlParams.get('stops');
console.log(stopListString);

/**
 * Read comma-separated stop ids from client URL.
 * Example: ?stops=1040601,1130110,1130438
 * Note that stop ids are not validated in any way.
 * Any comma-separated element after ?stops= will be returned.
 * @return {Array} Array of stop ids
 */
function getStopsFromURL() {
  let queryStringInURL = window.location.search;
  let urlParams = new URLSearchParams(queryStringInURL);

  if (!urlParams.has('stops')) {
    console.error('Missing `stops` parameter from URL');
    return null;
  };

  let stopListString = urlParams.get('stops');
  let stopArray = stopListString.split(',');
  return stopArray;
};

console.log(getStopsFromURL());

/*
Stop times request to Digitransit API to be made once a minute
and the HH:MM:SS clock.
See https://digitransit.fi/en/developers/apis/1-routing-api/stops/
for endpoint and request details.
Alternative queries as well as further stops
can be explored using GraphiQL:
https://digitransit.fi/en/developers/apis/1-routing-api/1-graphiql/

author: Arttu K
3/2019
*/

/*
Kamppi M -> east        "HSL:1040601"
Kauppak. tram -> Töölö  "HSL:1130110"
Kauppak. bus -> Töölö   "HSL:1130438"
*/

const ENDPOINT = "https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql";

// Change stop selection and number of departures here if needed.
const REQBODY = `{
                    stops(ids: ["HSL:1130438", "HSL:1130110", "HSL:1130446"]) {
                        code
                        lat
                        lon
                        stoptimesWithoutPatterns
                          (startTime: START_TIME_PLACEHOLDER,
                          numberOfDepartures: 17) {
                        realtimeDeparture
                        serviceDay
                        realtime
                        trip {
                            route {
                            shortName
                            mode
                            }
                        }
                        headsign
                        }
                    }
                }`;

// Limit number of departures to show;
// this is NOT the same as numberOfDepartures above!
// numberOfDepartures is requested per-stop.
const NDEPS = 17;

function zpad(nr) {
  // Zero padding for single-digit numbers in clock times
    if (nr < 10) {
      nr = '0' + nr
    }
    return nr;
  };

function formatDepTime(utcsecs, utcnow, realtime, nearSeconds = 360) {
  // Format UTC departure time into desired output
  let tilde_part = "";
  let time_part = "";
  if (realtime === false) {
    tilde_part = "~";
  };
  let diff = Math.abs(utcsecs - utcnow);
  //console.log(diff, nowseconds); // REMOVETHIS
  if (diff <= nearSeconds) {
    tilde_part = '<td class="notrealtime_sign near">' + tilde_part + "</td>";
    time_part = '<td class="dep_time_str near">' + Math.floor(diff / 60) + " min" + "</td>";
  } else {
    tilde_part = '<td class="notrealtime_sign">' + tilde_part + '</td>';
    let utcdatetime = new Date(utcsecs * 1000);
    let datetime_str = zpad(utcdatetime.getHours()) + ':' + zpad(utcdatetime.getMinutes());
    time_part = '<td class="dep_time_str">' + datetime_str + "</td>";
  };
  return tilde_part + time_part;
};

function renderDepRow(dep, nowseconds) {
  try {
  // Render a <tr> for departure object
  let output = "<tr>";

  // Line number / short name
  output += '<td class="route"><div class="route_short_name ' + dep.trip.route.mode.toLowerCase();
  output += '">' + dep.trip.route.shortName + "</div></td>";

  // Headsign
  output += '<td class="trip_headsign">' + dep.headsign + '</td>';

  // Departure time
  output += formatDepTime(dep.realtimeDeparture, nowseconds, dep.realtime);
  output += "</tr>\n";
  return output;
  } catch(e) {
    console.log(e);
    return "";
  };
};

function compare(a, b) {
  // For sorting departure objects by UTC departure times
  return a.utcDepTime - b.utcDepTime;
};

function renderDepartures(resp) {
  // Function for handling Digitransit API departures JSON response;
  // if there is anything wrong with the whole JSON object,
  // an error text is rendered instead of the table.
  try {
    let stops = resp["data"]["stops"];
    let departures = [];
    let time = new Date();
    let nowseconds = time.getHours() * 60 * 60 + time.getMinutes() * 60 + time.getSeconds();
    for (let i = 0; i < stops.length; i++) {
      let stopcode = stops[i]["code"];
      let stoptimes = stops[i]["stoptimesWithoutPatterns"];
      for (let j = 0; j < stoptimes.length; j++) {
        let dep = stoptimes[j];
        dep["stopcode"] = stopcode;
        departures.push(dep);
      };
    };
    // Calculate full UTC timestamp of departure by service day and timestamp from midnight
    for (let i = 0; i < departures.length; i++) {
      departures[i]["utcDepTime"] = departures[i].serviceDay + departures[i].realtimeDeparture
    };
    departures.sort(compare);
    departures = departures.slice(0, NDEPS);
    //console.log(departures);
    let htmlout = "<table>";
    for (i = 0; i < departures.length; i++) {
      htmlout += renderDepRow(departures[i], nowseconds);
    };
    $(".departures").html(htmlout);

  } catch (e) {
    console.log(e);
    $(".departures").html('<p class="error">Aikatauluja ei voitu hakea.<br><i>' + e.message + "</i></p>");
  };
};

/**
 * Get current UNIX seconds with offset seconds added.
 * @param  {int} offsetSec  number of seconds to add to current timestamp
 * @return {int}            Unix seconds of current timestamp + offset seconds
 */
function nowPlusOffset(offsetSec = 120) {
  let timestampNow = new Date();
  let nowSeconds = Math.floor(timestampNow.getTime() / 1000);
  return nowSeconds + offsetSec;
};

function loadDepartures() {
  // This function makes the final departures request
  // and passes the response to formatter functions
  // that write the result table to the document .departures div
  let timefrom = nowPlusOffset();
  let req_actual = REQBODY.replace("START_TIME_PLACEHOLDER", timefrom);
  //console.log(req_actual); // REMOVETHIS

  try {
    let xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
       let resp = JSON.parse(this.responseText);
       // TODO pass further to formatter function and show in body
       renderDepartures(resp);
       //console.log(resp); // REMOVETHIS
     }
    };
    xhttp.open("POST", ENDPOINT, true);
    xhttp.setRequestHeader("Content-type", "application/graphql");
    xhttp.send(req_actual);
  } catch (e) {
    console.log(e);
    $(".departures").html('<p class="error">Aikatauluja ei voitu hakea.<br><i>' + e.message + "</i></p>");
  };

};

function clock() {
  // Define current HHMMSS clock
  let time = new Date(),
  hours = time.getHours(),
  minutes = time.getMinutes(),
  seconds = time.getSeconds();
  $('.clock').html(zpad(hours) + ":" + zpad(minutes) + ":" + zpad(seconds));
}
setInterval(clock, 1000);

// Request departures when page loads and then every minute
function ajaxd_timed() {
    let time = new Date(),
    seconds = time.getSeconds()
    if (seconds == 0) {
      loadDepartures();
    }
}
$(document).ready(function() {
    loadDepartures();
    setInterval(ajaxd_timed, 1000);
});

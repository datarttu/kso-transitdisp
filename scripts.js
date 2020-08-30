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

/**
 * Return parameters from the client URL.
 * @return {URLSearchParams}  Parameters and their values read from the client URL
 */
function getURLParams() {
  let queryStringInURL = window.location.search;
  let parameters = new URLSearchParams(queryStringInURL);
  return parameters;
};

const urlParams = getURLParams();

/**
 * Conditional logging:
 * call console.log only if the URL has debug=true parameter.
 * To enable logging, add debug=true to the URL parameters.
 * @param {string}          msg           string to pass to console.log()
 * @param {URLSearchParams} urlParameters parameters read from client URL
 */
function condLog(msg, urlParameters = urlParams) {
  if (urlParameters.has('debug') && urlParameters.get('debug') === 'true') {
    console.log(msg);
  };
};

/**
 * Read comma-separated stop ids from client URL.
 * Example: ?stops=1040601,1130110,1130438
 * Note that stop ids are not validated in any way.
 * Any comma-separated element after ?stops= will be returned.
 * @param {URLSearchParams} urlParameters parameters read from client URL
 * @return {Array} Array of stop ids
 */
function getStopsFromURL(urlParameters = urlParams) {

  if (!urlParameters.has('stops')) {
    console.error('Missing `stops` parameter from URL');
    return null;
  };

  let stopListString = urlParameters.get('stops');
  let stopArray = stopListString.split(',');
  return stopArray;
};

/**
 * Prefix stop ids with a feed id, and combine them into a parameter value
 * string for Digitransit GraphQL query body.
 * @param   {string}  feedId  feed id, defaults to 'HSL'
 * @param   {Array}   stopIds stop ids as string array, by default from client URL
 * @return  {string}          stop list parameter value ready for QraphQL query body
 */
function formatStopsForQueryString(
  feedId = 'HSL',
  stopIds = getStopsFromURL()
) {
    if (!stopIds) {
      console.error('No stop ids given');
      return null;
    };
    let quotedStopsWithFeedId = stopIds.map(i => '"' + feedId + ':' + i + '"');
    return '[' + quotedStopsWithFeedId.join(', ') + ']';
  };

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
    console.error(e);
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

/**
 * Create the GraphQL request body for stop times.
 * @param   {string}  stopIdsParam      stop id selection string
 * @param   {int}     stopTimesFromTime UNIX seconds time to request stop times from
 * @param   {int}     numDepsPerStop    number of departures to request from each stop
 * @return  {string}                    Body string ready for a QraphQL request
 */
function createRequestBody(
  stopIdsParam = formatStopsForQueryString(),
  stopTimesFromTime = nowPlusOffset(),
  numDepsPerStop = 17
) {
  return `{
    stops(ids: ${stopIdsParam}) {
        code
        name
        desc
        stoptimesWithoutPatterns
          (startTime: ${stopTimesFromTime},
          numberOfDepartures: ${numDepsPerStop}) {
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
};

/**
 * Request stop departure times from Digitransit HSL GraphQL API
 * and render them to the document .departures div.
 */
function loadDepartures() {
  let requestBody = createRequestBody();

  try {
    let xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
       let resp = JSON.parse(this.responseText);
       condLog(resp);
       renderDepartures(resp);
     }
    };
    xhttp.open(
      method = "POST",
      url = "https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql");
    xhttp.setRequestHeader("Content-type", "application/graphql");
    xhttp.send(requestBody);
  } catch (e) {
    console.error(e);
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

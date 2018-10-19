# -*- coding: utf-8 -*-
"""
Created on Tue Oct 16 20:51:12 2018

Functions to fetch stop time data from HSL Digitransit API
and prepare response contents for website display.

@author: keripukki
"""

import requests
from datetime import datetime

def getStoptimesFromDigitransit(req_body, sec_offset=180, n_of_deps=15):
    """Send POST request to HSL Digitransit API,
    return JSON / dict object"""
    base_url = 'https://api.digitransit.fi/routing/v1/routers/hsl/index/graphql'
    headers = {'Content-Type': 'application/graphql'}
    
    # Replace startTime value placeholder with
    # current epoch seconds + offset
    start_time = int(datetime.timestamp(datetime.now()) + sec_offset)
    req_body = req_body.replace('START_TIME_PLACEHOLDER', str(start_time))
    
    req = requests.post(url=base_url, 
                        params=headers, 
                        json={'query': req_body})
    if req.status_code == 200:
        return req.json()
    else:
        return None

def aboutToDepart(int_time, limit=10):
    """If departure is within [limit] minutes from now,
    format time differently.
    Compare dep time to current time and return boolean.
    """
    ts = datetime.now()
    int_time_now = ts.hour*60*60 + ts.minute*60 + ts.second
    diff_minutes = (int_time - int_time_now) / 60
    
    return diff_minutes <= limit
    
def formatTime(int_time, about_to_depart=False):
    """Convert integer seconds from beginning of day
    1) to difference of minutes if about to depart
    2) to HH:MM string representation otherwise"""
    ts = datetime.now()
    
    # Digitransit uses clock times according to the GTFS standard:
    # values queried now but representing next day / after-midnight time
    # are represented as integers >= 86400,
    # so they must be changed accordingly for formatting.
    if int_time >= 86400:
        int_time -= 86400
        
    if about_to_depart:
        int_time_now = ts.hour*60*60 + ts.minute*60 + ts.second
        # Decimal minutes are floored by int(), e.g. 4.98 -> 4 min!
        diff_minutes = int((int_time - int_time_now) / 60)
        hhmm_str = str(diff_minutes) + ' min'
    else:
        hour_part = int(int_time / 60 // 60)
        minute_part = int((int_time - hour_part*60*60) / 60)
        hhmm_str = str(hour_part).zfill(2) + ':' + str(minute_part).zfill(2)
    
    return(hhmm_str)

def makeOrderedStoptimes(json_resp, max_len=10, near_limit=10, about_limit=5):
    """Convert stop time JSON / dict response
    into list per TRAM / BUS ordered by departure times,
    return dict"""

    tram_ls = []
    bus_ls = []
    resp_stops = json_resp['data']['stops']
    current_ts = datetime.now()
    current_int_seconds = current_ts.hour*60*60 + current_ts.minute*60 + current_ts.second
    
    for stop in resp_stops:
        for st in stop['stoptimesWithoutPatterns']:
            
            # Add tilde sign if departure time is not realtime
            if not st['realtime']:
                notrealtime_sign = '~'
            else:
                notrealtime_sign = ''
            
            # If int time is less than current seconds
            # (so the departure is for sure next day),
            # add 86400 to it so it is treated right
            # upon departure row sorting.
            # Time formatter function will take care
            # of int values >= 86400.
            dep_time_int = st['realtimeDeparture']
            if dep_time_int < current_int_seconds:
                dep_time_int += current_int_seconds
                
            # Check if the departure is near
            near_to_depart = aboutToDepart(dep_time_int, limit=near_limit)
            about_to_depart = aboutToDepart(dep_time_int, limit=about_limit)
                
            st_row = {'route_short_name': st['trip']['route']['shortName'],
                      'mode': st['trip']['route']['mode'].lower(),
                      'trip_headsign': st['headsign'],
                      'stop_code': stop['code'],
                      'notrealtime_sign': notrealtime_sign,
                      'dep_time_str': formatTime(dep_time_int, 
                                                 near_to_depart),
                      'about_to_depart': str(about_to_depart),
                      'dep_time_int': dep_time_int
                      }
            
            if st['trip']['route']['mode'] == 'TRAM':
                tram_ls.append(st_row)
            elif st['trip']['route']['mode'] == 'BUS':
                bus_ls.append(st_row)
    
    bus_ls = sorted(bus_ls, key = lambda x: (x['dep_time_int'], 
                                             x['route_short_name'],
                                             x['trip_headsign']))
    tram_ls = sorted(tram_ls, key = lambda x: (x['dep_time_int'], 
                                               x['route_short_name'],
                                               x['trip_headsign']))
        
    if len(tram_ls) > max_len:
        tram_ls = tram_ls[:max_len-1]
    if len(bus_ls) > max_len:
        bus_ls = bus_ls[:max_len-1]
    
    return {'tramtimes': tram_ls, 'bustimes': bus_ls}

def makeHtmlTable(deptimes_list):
    """Make HTML table from departure times dict list"""
    row_model = '''<tr>
    <td class="route_short_name {mode}">{route_short_name}</td>
    <td class="trip_headsign">{trip_headsign}</td>
    <td class="notrealtime_sign about-to-{about_to_depart}">{notrealtime_sign}</td>
    <td class="dep_time_str about-to-{about_to_depart}">{dep_time_str}</td>
    </tr>'''
    html = '<table>\n'
    html += '\n'.join([row_model.format(**el) for el in deptimes_list])
    html += '\n</table>'
    return html

def makeDepHtml(html_file, deptimes_dict):
    """Read in HTML file containing placeholders for deptimes_dict entries,
    make HTML tables into placeholders,
    return HTML string"""
    with open(html_file, 'r') as f:
        html = f.readlines()
    html = ''.join(html)
    deptables = {k:makeHtmlTable(v) for (k, v) in deptimes_dict.items()}
    html = html.format(**deptables)
    
    # Handle curly brackets for render_html_string()
    html = html.replace('{', '{{').replace('}', '}}')
    return html
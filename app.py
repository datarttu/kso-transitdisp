# -*- coding: utf-8 -*-

from flask import Flask
from flask import render_template
from flask import render_template_string
from flask import redirect
from flask import url_for
from flask_table import Table, Col
from stoptimeshandler import *

#####################
### CONFIGURATION ###

conf = {
# Request body to be sent to Digitransit API
"request_body": """{
                    stops(ids: ["HSL:1130438", "HSL:1130110"]) {
                        code
                        lat
                        lon
                        stoptimesWithoutPatterns (startTime: START_TIME_PLACEHOLDER, numberOfDepartures: 13) {
                        realtimeDeparture
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
                }""",

# Offset for start time in seconds:
# only departures after this time from now will be requested from Digitransit API
"start_offset": 180,

# Maximum amount of departure rows to show per div on the page
"max_departures_to_show": 13,

# Amount of minutes within which departures are considered 'near'
# and minutes left are shown instead of HH:MM
"near_limit": 10
}
        
############################
### END OF CONFIGURATION ###

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/departures')
def departures():

    resp = getStoptimesFromDigitransit(req_body=conf['request_body'],
                                       sec_offset=conf['start_offset'],
                                       n_of_deps=conf['max_departures_to_show'])
    
    deptimes = makeOrderedStoptimes(resp,
                                    max_len=conf['max_departures_to_show'],
                                    near_limit=conf['near_limit'])
    
    dep_html = makeDepHtml('templates/dep-template.html', deptimes)
    
    return render_template_string(dep_html)

if __name__ == '__main__':
    app.run()

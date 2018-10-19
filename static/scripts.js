// Define current HHMMSS clock
function clock() {
    // We create a new Date object and assign it to a variable called "time".
    let time = new Date(),
    
    // Access the "getHours" method on the Date object with the dot accessor.
    hours = time.getHours(),
    
    // Access the "getMinutes" method with the dot accessor.
    minutes = time.getMinutes(),
    
    
    seconds = time.getSeconds();

document.querySelectorAll('.clock')[0].innerHTML = harold(hours) + ":" + harold(minutes) + ":" + harold(seconds);
  
function harold(standIn) {
    if (standIn < 10) {
      standIn = '0' + standIn
    }
    return standIn;
  }
}
setInterval(clock, 1000);


// Call /departures every minute
$(document).ready(function() {
    $("#departures").load("/departures");
    setInterval("ajaxd_timed()", 1000);
});

function ajaxd_timed() {
    let time = new Date(),
    seconds = time.getSeconds()
    if (seconds == 0) {
        $("#departures").load("/departures");
    }
}

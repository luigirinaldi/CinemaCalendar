import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';

document.addEventListener('DOMContentLoaded', function() {
    console.log("Hello World!")
    let calendarEl : HTMLElement = document.getElementById('calendar')!;
    let calendar = new Calendar(calendarEl, {
        plugins: [ dayGridPlugin ],
        initialView: 'dayGridMonth'
    });
    calendar.render();
  });

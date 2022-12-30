##Run `ve-direct-charger-dashboard` at start up

### Step 1. create a daemon
```shell
$ cd /etc/init.d
$ sudo touch ve-direct-charger-dashboard-daemon
$ sudo vim ve-direct-charger-dashboard-daemon
```

Enter this, for example
```shell
#!/bin/sh -e
### BEGIN INIT INFO
# Provides:          ve-direct-charger-dashboard-daemon
# Required-Start:    $local_fs $remote_fs $network
# Required-Stop:     $local_fs $remote_fs $network
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: Start or stop the transmission-daemon.
# Description:       Listen to ve-direct USB logs; Broadcast logs via WebSocket; Provide web-ui to display the logs
### END INIT INFO

NAME=ve-direct-charger-dashboard
DAEMON=/usr/local/bin/$NAME
OPTIONS="-d /home/pi/ve-direct"
USER=pi
STOP_TIMEOUT=30

export PATH="${PATH:+$PATH:}/sbin"

[ -x $DAEMON ] || exit 0

[ -e /etc/default/$NAME ] && . /etc/default/$NAME

. /lib/lsb/init-functions

start_daemon () {
    if [ $ENABLE_DAEMON != 1 ]; then
        log_progress_msg "(disabled)"
                log_end_msg 255 || true
    else
        start-stop-daemon --start \
        --chuid $USER \
                $START_STOP_OPTIONS \
        --exec $DAEMON -- $OPTIONS || log_end_msg $?
                log_end_msg 0
    fi
}

case "$1" in
    start)
        log_daemon_msg "Starting daemon for" "$NAME"
        start_daemon
        ;;
    stop)
        log_daemon_msg "Stopping daemon for" "$NAME"
        start-stop-daemon --stop --quiet \
            --exec $DAEMON --retry $STOP_TIMEOUT \
            --oknodo || log_end_msg $?
        log_end_msg 0
        ;;
    reload)
        log_daemon_msg "Reloading daemon for" "$NAME"
        start-stop-daemon --stop --quiet \
            --exec $DAEMON \
            --oknodo --signal 1 || log_end_msg $?
        log_end_msg 0
        ;;
    restart|force-reload)
        log_daemon_msg "Restarting daemon for" "$NAME"
        start-stop-daemon --stop --quiet \
            --exec $DAEMON --retry $STOP_TIMEOUT \
            --oknodo || log_end_msg $?
        start_daemon
        ;;
    status)
        status_of_proc "$DAEMON" "$NAME" && exit 0 || exit $?
        ;;
    *)
        log_action_msg "Usage: /etc/init.d/$NAME {start|stop|reload|force-reload|restart|status}" || true
        exit 2
        ;;
esac

exit 0
```

### Step 2. run the daemon at startup
```shell
$ sudo chmod +x ve-direct-charger-dashboard-daemon
$ sudo update-rc.d ve-direct-charger-dashboard-daemon defaults
```
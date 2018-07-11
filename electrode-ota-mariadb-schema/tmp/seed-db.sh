#!/bin/bash

SEED=/tmp/seed.sql

echo "sleeping for 5 sec while seeding database"
sleep 5s

echo "seeding database"
mysql --user=${MYSQL_USER} --password=${MYSQL_PASSWORD} ${MYSQL_DATABASE} < ${SEED}
rc=$?

if [ $rc -ne 0 ]
then
    echo "error during seeding; exiting"
    exit $rc
fi

exit $rc
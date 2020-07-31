FROM node:8-alpine
LABEL Microtica <support@microtica.com>

ADD . /app
RUN cd /app; npm install --production
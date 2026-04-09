FROM nginx:stable-alpine3.23-perl AS root
WORKDIR /usr/share/nginx/html
COPY ./frontend /usr/share/nginx/html
RUN sed -i 's/localhost:3000/hof.branchina.edu.it/g' main.js

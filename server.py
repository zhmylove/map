#!/usr/bin/env python
# vim: et ts=3 sw=3 :

from BaseHTTPServer import HTTPServer
from BaseHTTPServer import BaseHTTPRequestHandler
import os.path
import re

PORT = 8080
FILE = "map.db"

class JSONRequestHandler (BaseHTTPRequestHandler):

   def do_GET(self):
      self.send_response(200);

      if self.path == "/favicon.ico":
         return

      if self.path == "/":
         self.path = "index.html"

      self.path = self.path.strip("/")

      if os.path.isfile(self.path):
         curr_file = self.path

         if re.match(r'.*\.js$', curr_file):
            self.send_header("Content-type", "application/javascript")
         elif re.match(r'.*\.css$', curr_file):
            self.send_header("Content-type", "text/css")
         else:
            self.send_header("Content-type", "text/html")

         self.wfile.write("\r\n")

      else:
         curr_file = FILE
         self.send_header("Content-type", "application/json")
         self.wfile.write("\r\n")


      try:
         output = open(curr_file, 'r').read()

      except Exception:
         output = '{"name": "empty"}'

      self.wfile.write(output)

   def do_POST(self):
      self.data_string = self.rfile.read(
            int(self.headers.getheader('content-length', 0))
            )

      try:
         with open(FILE, 'w') as out:
            out.write(self.data_string)

      except Exception:
         print "Write failed"
         sys.exit()

      self.send_response(200)
      self.send_header("Content-type", "text/plain")
      self.end_headers()

server = HTTPServer(("127.0.0.1", PORT), JSONRequestHandler)
server.serve_forever()

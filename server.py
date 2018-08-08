#!/usr/bin/env python
# vim: et ts=3 sw=3 :

from BaseHTTPServer import HTTPServer
from BaseHTTPServer import BaseHTTPRequestHandler

PORT = 8080
FILE = "map.db"

class JSONRequestHandler (BaseHTTPRequestHandler):

   def do_GET(self):
      self.send_response(200);
      self.send_header("Content-type", "application/json")
      self.wfile.write("\r\n")

      try:
         if self.path == "/":
            output = open("index.html", 'r').read()
         elif self.path == "/index.html":
            output = open("index.html", 'r').read()
         else:
            output = open(FILE, 'r').read()

      except Exception:
         output = "{'name': 'empty'}"
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
      self.end_headers()

server = HTTPServer(("127.0.0.1", PORT), JSONRequestHandler)
server.serve_forever()

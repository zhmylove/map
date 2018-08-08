<?php
header("Content-Type: application/json");
$v = json_decode(stripslashes(file_get_contents("php://input")));
file_put_contents("map.db", "".json_encode($v));
?>

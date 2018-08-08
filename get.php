<?php
header("Content-Type: application/json");
$map = file_get_contents("map.db");
echo strlen($map) == 0 ? "{\"name\":\"empty\"}" : $map;
?>

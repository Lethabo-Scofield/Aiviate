from math import radians, sin, cos, sqrt, atan2
from geopy.geocoders import Nominatim

DEPOT = {"name": "Main Warehouse", "lat": -26.1234, "lng": 28.0456}


def geocode_address(address, geolocator):
    try:
        location = geolocator.geocode(address + ", South Africa")
        if location:
            return location.latitude, location.longitude
        address_parts = address.split(',')
        if len(address_parts) > 2:
            simple_address = ','.join(address_parts[:-1]) + ", South Africa"
            location = geolocator.geocode(simple_address)
            if location:
                return location.latitude, location.longitude
        if len(address_parts) > 2:
            suburb_city = ','.join(address_parts[-3:]) + ", South Africa"
            location = geolocator.geocode(suburb_city)
            if location:
                return location.latitude, location.longitude
    except Exception:
        pass
    return DEPOT["lat"], DEPOT["lng"]


def _haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


def build_distance_matrix(locations):
    n = len(locations)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = _haversine(locations[i][0], locations[i][1], locations[j][0], locations[j][1])
            matrix[i][j] = d
            matrix[j][i] = d
    return matrix


def _nearest_neighbor_tsp(dist_matrix, start=0):
    n = len(dist_matrix)
    visited = [False] * n
    visited[start] = True
    route = [start]
    total = 0.0
    current = start

    for _ in range(n - 1):
        best_next = -1
        best_dist = float("inf")
        for j in range(n):
            if not visited[j] and dist_matrix[current][j] < best_dist:
                best_dist = dist_matrix[current][j]
                best_next = j
        if best_next == -1:
            break
        visited[best_next] = True
        route.append(best_next)
        total += best_dist
        current = best_next

    total += dist_matrix[current][start]
    return route, total


def _two_opt_improve(route, dist_matrix, max_iterations=1000):
    n = len(route)
    improved = True
    iterations = 0

    while improved and iterations < max_iterations:
        improved = False
        iterations += 1
        for i in range(1, n - 1):
            for j in range(i + 1, n):
                d_old = dist_matrix[route[i - 1]][route[i]] + dist_matrix[route[j]][route[(j + 1) % n]]
                d_new = dist_matrix[route[i - 1]][route[j]] + dist_matrix[route[i]][route[(j + 1) % n]]
                if d_new < d_old:
                    route[i:j + 1] = reversed(route[i:j + 1])
                    improved = True

    total = sum(dist_matrix[route[k]][route[(k + 1) % n]] for k in range(n))
    return route, total


def solve_tsp(dist_matrix, start=0):
    if len(dist_matrix) <= 2:
        route = list(range(len(dist_matrix)))
        total = sum(dist_matrix[route[k]][route[(k + 1) % len(route)]] for k in range(len(route)))
        return route, total

    route, _ = _nearest_neighbor_tsp(dist_matrix, start)
    route, total = _two_opt_improve(route, dist_matrix)
    return route, total


def optimize_route_from_data(stops, num_vehicles=1):
    if len(stops) < 2:
        return stops

    locations = [(DEPOT["lat"], DEPOT["lng"])] + [(s["lat"], s["lng"]) for s in stops]
    dist_matrix = build_distance_matrix(locations)

    route, _ = solve_tsp(dist_matrix, start=0)

    ordered = []
    for node in route:
        if node > 0:
            ordered.append(stops[node - 1])

    return ordered

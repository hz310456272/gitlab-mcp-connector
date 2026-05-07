# Self-Hosted GitLab

This connector works with any GitLab instance — GitLab.com, self-hosted, or internal deployments.

## Base URL format

The `baseUrl` must include the scheme and hostname, with no trailing slash:

```
https://gitlab.example.com
https://gitlab.mycompany.internal
https://192.168.1.50
```

For non-standard ports:

```
https://gitlab.example.com:8443
```

The connector appends `/api/v4/...` paths automatically.

## VPN / internal network

If your GitLab instance is only reachable via VPN:

1. Ensure the VPN is connected before starting the MCP server.
2. Use the internal hostname or IP as `baseUrl`.
3. The MCP server runs as a long-lived process — if the VPN drops, subsequent API calls will fail with connection errors.

## Internal DNS

If your GitLab uses an internal hostname:

1. Ensure the hostname resolves correctly from the machine running the connector.
2. Test with: `curl https://gitlab.mycompany.internal/api/v4/version`
3. If DNS only works inside a VPN, see VPN section above.

## TLS certificates

Node.js TLS behavior depends on the Node.js version, how it was built (system OpenSSL vs. bundled), and startup flags.

If you encounter certificate chain errors:

1. **Best option**: Add your internal CA certificate to the system trust store.
   - **macOS**: Add to Keychain → System → Trust
   - **Linux**: Copy to `/usr/local/share/ca-certificates/` and run `update-ca-certificates`

2. **Alternative**: Set `NODE_EXTRA_CA_CERTS` to point to your CA bundle:
   ```bash
   export NODE_EXTRA_CA_CERTS=/path/to/ca-bundle.crt
   ```

3. **Do not** use `NODE_TLS_REJECT_UNAUTHORIZED=0`. This disables TLS verification globally and is unsafe.

## Troubleshooting connectivity

- **ECONNREFUSED** — Check that the host and port are correct, and that the GitLab instance is reachable from your machine.
- **ENOTFOUND** — DNS resolution failed. Check the hostname or use an IP address.
- **UNABLE_TO_VERIFY_LEAF_SIGNATURE** / **CERT_HAS_EXPIRED** — TLS certificate chain issue. See TLS certificates above.
- **401 Unauthorized** — Token is missing, expired, or lacks required scope.

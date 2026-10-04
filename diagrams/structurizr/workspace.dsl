/*
 * GraphBPMS: the C4 model as code.
 *
 * Simplified on purpose: no internal class, table or procedure names.
 * Render with Structurizr Lite:
 *   docker run -it --rm -p 8080:8080 -v "$PWD/diagrams/structurizr:/usr/local/structurizr" structurizr/lite
 * Validate with the Structurizr CLI:
 *   structurizr.sh validate -workspace diagrams/structurizr/workspace.dsl
 */
workspace "GraphBPMS architecture notes" "An enterprise low-code BPM platform, described at C4 levels 1 to 3 plus deployment." {

    model {
        employee = person "Employee / Manager" "Works the inbox, approves or rejects, reads dashboards."
        designer = person "Process designer" "Models processes, forms, decision tables, reports and data connectors."
        admin = person "Administrator" "Manages organizations, users, roles, permissions and settings."
        fieldWorker = person "Field worker" "Collects data offline on an Android device."
        externalUser = person "External user" "Fills in public forms without an account."

        idp = softwareSystem "Identity provider" "OpenID Connect single sign-on, LDAP / Active Directory." "External"
        enterprise = softwareSystem "Enterprise systems" "Databases and REST/SOAP services of the customer, often behind an ESB." "External"
        messaging = softwareSystem "Messaging services" "SMTP, SMS gateway, browser push services." "External"
        maps = softwareSystem "Map services" "WMS, tile services, ArcGIS REST." "External"

        bpms = softwareSystem "GraphBPMS" "Low-code BPM platform: BPMN/DMN engine, forms, reports, dashboards, mobile, GIS." {
            ui = container "Web UI" "Inbox, designers, dashboards and public portal; right-to-left, Jalali calendar." "Razor, jQuery, Knockout" "Browser"
            mobile = container "Mobile app and PWA" "Offline forms and field tasks; branded app built on the server." "Android, IndexedDB" "Mobile"

            app = container "Web application" "Process engine, form and report runtime, authorization, API, scheduler, SSE." "ASP.NET MVC 5, .NET Framework 4.8, IIS" {
                pipeline = component "Request pipeline" "Cookie and JWT authentication, anti-forgery, rate limiting, input sanitizing." "OWIN, MVC filters"
                controllers = component "Controllers" "UI endpoints, process API, service-bus endpoints, public forms, mobile sync, SSE." "ASP.NET MVC, about 80 controllers"
                authz = component "Authorization" "Permission checks from module down to record; cached per user, evicted by tags." "C#"
                engine = component "Process engine" "BPMN interpreter: walk loop, lanes, gateways, timers, messages, signals, sandbox." "C#"
                forms = component "Form runtime" "Form definitions, generated tables, field rules per step, record signing." "C#"
                reports = component "Reports and dashboards" "Report designer, BI widgets, data-driven alerts, process monitoring." "C#, Stimulsoft, DevExpress"
                providers = component "Provider runtime" "Reusable SQL, REST and SOAP connectors with hidden parameter sources." "C#"
                identity = component "Identity and organizations" "Users, roles, organization chart, active organization." "C#, OWIN, OIDC"
                notify = component "Notification dispatcher" "In-app, Server-Sent Events, Web Push, email, SMS." "C#"
                scheduler = component "Scheduler" "Process timers, report alerts, housekeeping; clustered job store." "Quartz.NET"
                dataAccess = component "Data access" "One stored procedure per operation; query and duration logging." "Dapper"
            }

            db = container "Database" "Core schema, generated form tables, scheduler tables, audit and logs." "SQL Server 2019/2022" "Database"
            files = container "File storage" "Attachments, archive, thumbnails." "File share, FTP or S3-compatible" "Database"
        }

        # People and the system
        employee -> ui "Works the inbox, approves, reads dashboards" "HTTPS"
        designer -> ui "Designs processes, forms and reports" "HTTPS"
        admin -> ui "Administers organizations and permissions" "HTTPS"
        externalUser -> ui "Submits public forms" "HTTPS, anonymous"
        fieldWorker -> mobile "Collects field data"

        # Containers
        ui -> pipeline "Calls" "HTTPS, JSON, SSE"
        mobile -> pipeline "Syncs" "HTTPS, JWT"
        enterprise -> pipeline "Starts processes, sends messages" "REST/JSON"
        ui -> maps "Loads map layers" "HTTPS"

        # Components of the web application
        pipeline -> controllers "Passes authenticated requests to"
        controllers -> authz "Checks permissions with"
        controllers -> engine "Sends process commands to"
        controllers -> forms "Reads and saves form data with"
        controllers -> reports "Renders reports and dashboards with"
        controllers -> identity "Logs in and switches organization with"
        engine -> forms "Validates and saves step data with"
        engine -> providers "Executes service, send and receive tasks with"
        engine -> notify "Notifies assignees with"
        engine -> dataAccess "Persists work items, variables and the inbox projection with"
        reports -> providers "Loads data sources with"
        forms -> providers "Fills fields and lookups with"
        forms -> dataAccess "Reads and writes form tables with"
        reports -> dataAccess "Runs monitoring queries with"
        authz -> dataAccess "Resolves grants with"
        identity -> dataAccess "Reads users, roles and memberships with"
        identity -> idp "Authenticates users with" "OIDC, LDAP"
        scheduler -> controllers "Fires timers through the process API" "HTTPS"
        scheduler -> db "Stores triggers in" "TDS"
        dataAccess -> db "Calls stored procedures on" "TDS, encrypted"
        forms -> files "Stores attachments in" "SMB, FTP or S3"
        providers -> enterprise "Queries and calls" "SQL, REST, SOAP"
        notify -> messaging "Sends email, SMS and push via" "SMTP, HTTPS"
        notify -> ui "Pushes events to open tabs" "SSE"

        production = deploymentEnvironment "Production" {
            deploymentNode "User device" "" "Modern browser" {
                uiInstance = containerInstance ui
            }
            deploymentNode "Android device" "" "Android 8+" {
                mobileInstance = containerInstance mobile
            }
            deploymentNode "DMZ" "" "Customer network" {
                proxy = infrastructureNode "Reverse proxy and load balancer" "WAF, TLS termination, sticky sessions, long-lived responses for SSE." "IIS ARR, Nginx or HAProxy"
            }
            deploymentNode "Application zone" "" "Customer data center" {
                deploymentNode "Application node" "" "Windows Server 2019/2022, IIS 10" "" 2 {
                    appInstance = containerInstance app
                }
            }
            deploymentNode "Data zone" "" "Customer data center" {
                deploymentNode "Database server" "" "SQL Server 2019/2022, AlwaysOn optional" {
                    dbInstance = containerInstance db
                }
                deploymentNode "File server" "" "Windows file share, RAID 10" {
                    filesInstance = containerInstance files
                }
            }
            proxy -> appInstance "Forwards to" "HTTPS, allow-listed source"
        }
    }

    views {
        systemContext bpms "SystemContext" "Level 1: the platform between people and the customer's systems." {
            include *
            autoLayout tb
        }

        container bpms "Containers" "Level 2: a modular monolith with one database." {
            include *
            autoLayout tb
        }

        component app "WebApplicationComponents" "Level 3: one request path from controller to stored procedure." {
            include *
            autoLayout tb
        }

        dynamic app "CompleteWorkItem" "An employee approves a work item; the engine walks to the next wait state." {
            ui -> pipeline "POST complete work item, with anti-forgery header"
            pipeline -> controllers "Authenticated request"
            controllers -> authz "Check permission and organization"
            controllers -> engine "Complete(work item, action, data)"
            engine -> forms "Validate and save form data"
            engine -> providers "Run the next service task"
            engine -> dataAccess "Create next work items, update the inbox projection"
            engine -> notify "Notify the new assignees"
            notify -> ui "Event to open tabs"
            autoLayout lr
        }

        deployment bpms production "Deployment" "Four network zones; each zone talks only to its neighbour." {
            include *
            autoLayout tb
        }

        styles {
            element "Element" {
                color #ffffff
            }
            element "Person" {
                shape Person
                background #08427b
            }
            element "Software System" {
                background #1168bd
            }
            element "External" {
                background #999999
            }
            element "Container" {
                background #438dd5
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Database" {
                shape Cylinder
            }
            element "Browser" {
                shape WebBrowser
            }
            element "Mobile" {
                shape MobileDevicePortrait
            }
            element "Infrastructure Node" {
                background #ffffff
                color #000000
            }
            element "Deployment Node" {
                background #ffffff
                color #000000
            }
        }
    }
}

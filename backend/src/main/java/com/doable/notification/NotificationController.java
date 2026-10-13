package com.doable.notification;

import com.doable.common.CurrentUser;
import com.doable.notification.NotificationService.NotificationList;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notifications;

    public NotificationController(NotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public NotificationList list(@AuthenticationPrincipal Jwt jwt) {
        return notifications.list(CurrentUser.id(jwt));
    }

    @PostMapping("/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void read(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        notifications.markRead(CurrentUser.id(jwt), id);
    }

    @PostMapping("/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void readAll(@AuthenticationPrincipal Jwt jwt) {
        notifications.markAllRead(CurrentUser.id(jwt));
    }
}
